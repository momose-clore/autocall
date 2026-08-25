import { getSystemSetting } from "@/lib/settings";
import { updateSettingsAction } from "../actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSystemSetting();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">システム設定</h1>
        <p className="text-sm text-muted-foreground">
          全体トグル・発信間隔・安全上限（仕様書 35/45/46）
        </p>
      </div>

      <form action={updateSettingsAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">全体トグル</CardTitle>
            <CardDescription>
              OFF にすると個別設定が ON でも無効になります。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleRow
              name="wakeupEnabled"
              label="起床確認を有効化"
              defaultChecked={s.wakeupEnabled}
            />
            <ToggleRow
              name="lineEnabled"
              label="LINE 通知"
              defaultChecked={s.lineEnabled}
            />
            <ToggleRow
              name="phoneEnabled"
              label="自動電話"
              defaultChecked={s.phoneEnabled}
            />
            <ToggleRow
              name="adminLineNotify"
              label="管理者へエスカレーション通知"
              defaultChecked={s.adminLineNotify}
            />
            <ToggleRow
              name="skipHolidays"
              label="休日はスキップ"
              defaultChecked={s.skipHolidays}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">間隔・エスカレーション（分）</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <NumberField
              name="defaultCallInterval"
              label="電話 再発信間隔"
              defaultValue={s.defaultCallInterval}
            />
            <NumberField
              name="defaultLineInterval"
              label="LINE 再通知間隔"
              defaultValue={s.defaultLineInterval}
            />
            <NumberField
              name="escalationMinutes"
              label="エスカレーションまで"
              defaultValue={s.escalationMinutes}
            />
            <NumberField
              name="maxDurationMinutes"
              label="最大継続時間"
              defaultValue={s.maxDurationMinutes}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">安全上限</CardTitle>
            <CardDescription>
              最低発信間隔はシステム下限 60 秒を強制します（仕様書 46）。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <NumberField
              name="minCallIntervalSeconds"
              label="最低発信間隔（秒）"
              defaultValue={s.minCallIntervalSeconds}
              min={60}
            />
            <NumberField
              name="maxCallsPerPersonHour"
              label="1人あたり/時 上限"
              defaultValue={s.maxCallsPerPersonHour}
            />
            <NumberField
              name="maxCallsSystemHour"
              label="全体/時 上限"
              defaultValue={s.maxCallsSystemHour}
            />
            <NumberField
              name="lineMonthlyQuota"
              label="LINE 月間上限"
              defaultValue={s.lineMonthlyQuota}
            />
          </CardContent>
        </Card>

        <Separator />
        <div className="flex justify-end">
          <Button type="submit">保存する</Button>
        </div>
      </form>
    </div>
  );
}

function ToggleRow({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={name} className="text-sm font-normal">
        {label}
      </Label>
      <Switch id={name} name={name} defaultChecked={defaultChecked} />
    </div>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  min,
}: {
  name: string;
  label: string;
  defaultValue: number;
  min?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        defaultValue={defaultValue}
      />
    </div>
  );
}
