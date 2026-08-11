import { DocumentAction } from "@/generated/prisma/enums";
import { formatThaiDate } from "@/lib/thai";

/** Thai wording for each recorded action, as the design shows it. */
export const ACTION_LABELS: Record<DocumentAction, string> = {
  [DocumentAction.CREATED]: "สร้างเอกสาร",
  [DocumentAction.SUBMITTED]: "ลงลายเซ็นและส่งอนุมัติ",
  [DocumentAction.RESUBMITTED]: "แก้ไขและส่งอนุมัติอีกครั้ง",
  [DocumentAction.APPROVED]: "อนุมัติเอกสาร",
  [DocumentAction.RETURNED]: "ขอให้แก้ไข",
  [DocumentAction.REJECTED]: "ไม่อนุมัติเอกสาร",
};

export type TimelineEvent = {
  id: string;
  action: DocumentAction;
  detail: string | null;
  actorName: string;
  actorRole: string;
  at: Date;
};

export function DocumentTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;

  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-normal opacity-50">ประวัติการดำเนินการ</h3>
      <ol className="m-0 flex list-none flex-col p-0">
        {events.map((event) => (
          <li key={event.id} className="flex gap-2.5 border-b border-divider py-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-text" aria-hidden />
            <div className="flex-1">
              <div className="text-xs font-semibold">
                {ACTION_LABELS[event.action]}
                {event.detail ? `: ${event.detail}` : ""}
              </div>
              <div className="text-[10px] opacity-50">
                {event.actorName} · {event.actorRole} ·{" "}
                {formatThaiDate(event.at)}{" "}
                {event.at.toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
