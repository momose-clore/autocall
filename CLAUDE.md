# オートコール プロジェクト

## このターミナルの運用ルール（概念）

以下は本プロジェクトでの作業方針。ターミナルが削除されても、このファイルを読めば同じ運用を即座に再開できる。

1. **基本的なYES取りはいらない** — 当たり前の確認は求めず、自律的に判断して実行する。方向性を左右する本質的な選択のみ確認する。
2. **毎回更新・変更内容を保存する** — 作業のたびにファイル/git へ保存し、進捗を残す。
3. **知識はWEBで調べる** — 不確かな知識・仕様・最新情報はWEB検索で裏取りしてから使う。
4. **プロフェッショナルの概念を取り込む** — プログラマー / システムエンジニア / ITコンサルタントの視点・ベストプラクティスを学習してプロジェクトに反映する。
5. **指示の受け取り方を常に学習する** — 指示内容を学習し、最適な進め方に改善し続ける。
6. **復旧可能性を担保する** — このターミナルが何らかの理由で消えても即復旧できるよう、方針・構成・手順をファイルに残す（本 CLAUDE.md と memory）。
7. **必要な言語環境は自分で用意する** — 必要な言語・ツールはダウンロード/セットアップして進める。

## 現在の環境
- OS: macOS (Darwin 24.2.0)
- Node.js: v24.16.0
- Python: 3.9.6
- git: 2.39.5

## プロジェクト概要
**起床確認・自動架電システム（単体構築版）**。稼働者・ドライバー向けに、起床時刻に LINE 通知＋自動電話を行い、起床確認が取れるまで再通知・再架電、確認された瞬間に停止、未確認は管理者へエスカレーションするまでを完全自動化する。開発指示書（62セクション）準拠。

- ユーザー選択: 既存システムへの追加ではなく、この `オートコール` フォルダに**新規・単体構築**。将来的に既存の配送アプリ（delivery-app）等と連携する前提。
- 技術構成: Next.js 16 (App Router) / TypeScript / Prisma 7 (+pg adapter) / PostgreSQL(Neon) / LINE Messaging API / Twilio Programmable Voice / Vercel Cron。
- 起床判定は常に Asia/Tokyo。二重発信防止・緊急停止・最大継続時間・テストモード等の安全仕様を必須実装。

## 主要コマンド
- `npm run dev` — 開発サーバ
- `npm run db:push` — スキーマを DB へ反映（要 DATABASE_URL）
- 環境変数は `.env.example` 参照（Twilio/LINE/CRON_SECRET/WAKEUP_TEST_MODE 等）

## 実装状況（Phase）
- [x] Phase 1: 環境構築 / [x] Phase 2: DB設計
- [x] Phase 3: Provider抽象層（Twilio/LINE、テストモード誤発信防止）
- [x] Phase 4: 業務ヘルパ（time/phone/config/settings/audit/effective/generate/confirm/notify/send）
- [x] Phase 5: スケジューラ中核（processTick：開始・再通知・再架電・エスカレーション・最大継続打切り・レート制限）
- [x] Phase 6: API（cron tick/generate、Twilio voice/gather/status、LINE webhook）＋ Vercel Cron 定義
- [x] Phase 7: 認証（HMAC Cookie セッション・proxy ガード・scrypt パスワード・簡易ログイン）
- [x] Phase 8: 管理UI（shadcn/ui・dark）ダッシュボード/ドライバー/システム設定/操作ログ、緊急停止・手動tick・当日生成・連携コード発行
- [x] Phase 9: 実DB接続・結合検証。Neon(Vercel Marketplace)接続、db:push/db:seed、generate→tick→電話確定→停止・エスカレーション・最大継続打切りを実DBで検証。TZバグ(@db.Date 1日ズレ)修正
- [ ] Phase 10-12: ドライバー/シフトCRUD・通知先管理UI / LINE・Twilio 実接続テスト / 本番デプロイ

## DB/実行メモ（復旧用）
- DB: Neon（Vercel Marketplace統合 `neon-copper-queen`、プロジェクト `autocall`／scope momose-clores-projects）。接続情報は `.env.local`（gitignore）。`vercel env pull` で再取得可。
- Prisma CLI/seed は `.env.local` を自動で読まないため、prisma.config.ts と seed.ts で dotenv 明示ロード。DDL は `DATABASE_URL_UNPOOLED`（非プール）を使用。
- seed/検証スクリプトは `tsx` で実行（生成 Prisma Client が拡張子なし import のため node 素実行不可）。`npm run db:seed` / `npx tsx scripts/db-check.ts [show|reset|age <分>|id]`。
- @db.Date は `jstDateOnly()`（JST日付の UTC 深夜）で保存すること。JST深夜インスタント（前日15:00Z）を渡すと日付が1日ズレる。

## UI/認証メモ（復旧用）
- shadcn/ui（new-york, radix, dark）。globals.css の `--font-sans` はリテラル Geist 指定（循環参照回避）。
- ルーティング: `/` → `/admin` リダイレクト。`/login`（Server Action ログイン）。`/admin/*` は `src/proxy.ts`（Next16 proxy 規約）が Cookie 一次ガード＋各ページ `requireUser()` で厳密検証。
- 管理操作は Server Actions（`src/app/admin/actions.ts`）: 起床確認/対象外/手動tick/当日生成/緊急停止/設定更新/連携コード発行。すべて AuditLog 記録。
- seed 管理者: admin@example.com / パスワード admin1234（本番前に必ず変更）。

## アーキテクチャ要点（復旧用）
- スケジューラは Vercel Cron が `/api/cron/tick`（毎分）を叩き `processTick()` が全稼働セッションを1ステップ進める。状態機械: WAITING→CALLING→(CONFIRMED|OVERDUE→FAILED|CANCELLED)。
- 確定は `confirmSession()` が updateMany の条件付き更新で冪等化（LINEボタン/電話「1」/管理者）。確定時に進行中通話を Twilio 側でも終了。
- 安全仕様: emergencyStop / wakeupEnabled、最低発信間隔（システム下限60秒）、1人・全体の時間あたり発信上限、テストモード（TEST_ALLOW_* 以外へ実発信・実送信しない）。
- Cron 認証は CRON_SECRET（Authorization: Bearer / x-cron-secret / ?secret=）。毎分 tick は Vercel Pro プラン以上が必要。

## Git/デプロイ状況（復旧用）
- GitHub: https://github.com/momose-clore/autocall （**Public**）。`.gitignore` で `.env*`・`.vercel` 除外＝秘密は未push。
- Vercel: プロジェクト `autocall`（scope momose-clores-projects）に `vercel git connect` 済み。**ただし Vercel GitHub App 未インストールのため push 自動デプロイは未発動**（初回はブラウザでApp許可 or `vercel deploy` 手動）。
- GitHub Actions: Claude（`.github/workflows/claude.yml` @claudeメンション / `claude-code-review.yml` PRレビュー）。トークンは Secret `CLAUDE_CODE_OAUTH_TOKEN` 参照。
- Twilio: Pay as you go でアカウント作成・残高¥2,000チャージ済み（Account SID/Auth Token取得可）。番号購入・日本Geo許可・LINE作成は未了（Phase 10 進行中）。
- ⚠️ **公開＆本番デプロイ前の必須対応**: seed の admin@example.com/`admin1234` は公開コードに露出。本番投入前にパスワード変更 or 本番seedを無効化すること。

## 変更履歴
- 2026-08-25: プロジェクト初期化。運用ルールを永続化、git 初期化。
- 2026-08-25: 起床確認・自動架電システムに確定。Next.js16+Prisma7 構築、DBスキーマ実装。
- 2026-08-25: Phase 3-6 実装。Provider抽象層・業務ヘルパ・スケジューラ中核・API群・Vercel Cron。tsc strict グリーン。
- 2026-08-25: Phase 7-8 実装。認証（Cookie/scrypt/proxy）・管理UI（shadcn/ui dark：ダッシュボード/ドライバー/設定/ログ）。next build 成功。
- 2026-08-26: Phase 9。Neon(Vercel Marketplace)接続・db:push/seed。実DBで generate→tick→電話確定→停止/エスカレーション/打切りを結合検証。@db.Date のTZ 1日ズレを jstDateOnly で修正。tsx 導入。
- 2026-08-29: Git連携。GitHub リポジトリ作成→Public化、Vercel git connect、Claude GitHub Actions 追加。Twilioアカウント作成・チャージ（Phase 10 実接続テスト準備中）。Webhook絶対URLを VERCEL_URL 由来に。
