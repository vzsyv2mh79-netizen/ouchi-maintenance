"use client";
import { calendarExport } from "@/lib/calendar-export";
import type { AppData } from "@/lib/types";

export function CalendarControls({ data }: { data: AppData }) {
  return <section className="settings-group"><h2>カレンダーでリマインド</h2><p>次回予定と繰り返し周期をカレンダーに登録できます。予定は午前9時、通知は前日の午前9時です。取り込み後、カレンダー側の通知設定を確認してください。</p>
    <button className="secondary-button" disabled={!data.tasks.length} onClick={() => {
      const url = URL.createObjectURL(new Blob([calendarExport(data)], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "ouchi-maintenance.ics"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>予定をカレンダー用に保存</button>
    <p>ファイルをAppleカレンダーなどで開くか、Googleカレンダーの「インポート」で取り込んでください。アプリで完了・周期変更・削除しても、自動では同期されません。更新時は以前取り込んだ予定を整理し、再度取り込んでください。</p>
  </section>;
}
