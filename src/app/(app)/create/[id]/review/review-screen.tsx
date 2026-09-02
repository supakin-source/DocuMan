"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ExpenseItemType } from "@/generated/prisma/enums";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { ScreenHeader } from "@/components/screen-header";
import { ApiRequestError, apiSend } from "@/lib/client/api";
import {
  computeItemAmount,
  DEFAULT_RATE_PER_KM,
  hasRoute,
  isDerivedAmount,
  ITEM_TYPE_LABELS,
} from "@/lib/domain/items";
import { formatMoney } from "@/lib/thai";

export type EditableItem = {
  key: string;
  type: ExpenseItemType;
  incurredOn: string;
  origin: string;
  destination: string;
  purpose: string;
  /** Held as strings so a half-typed "1." does not get normalised mid-keystroke. */
  distanceKm: string;
  ratePerKm: string;
  amount: string;
  attachmentId: string | null;
  attachmentIsImage: boolean;
};

const SUBTYPES: ExpenseItemType[] = [
  ExpenseItemType.PERSONAL_VEHICLE,
  ExpenseItemType.PUBLIC_TRANSPORT,
  ExpenseItemType.TOLL,
];

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The amount a line is worth right now, mirroring the server's own rule. */
function amountOf(item: EditableItem): number {
  return computeItemAmount({
    type: item.type,
    distanceKm: toNumber(item.distanceKm),
    ratePerKm: toNumber(item.ratePerKm),
    amount: toNumber(item.amount),
  });
}

export function ReviewScreen({
  documentId,
  initialItems,
}: {
  documentId: string;
  initialItems: EditableItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + amountOf(item), 0),
    [items],
  );

  // Every line must carry a real amount before the document can go anywhere.
  const incomplete = items.length === 0 || items.some((item) => amountOf(item) <= 0);

  function patch(key: string, changes: Partial<EditableItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }

  function addItem(type: ExpenseItemType) {
    setAddOpen(false);
    setItems((current) => [
      ...current,
      {
        key: `new-${Date.now()}-${current.length}`,
        type,
        incurredOn: new Date().toISOString().slice(0, 10),
        origin: "",
        destination: "",
        purpose: "ไปปฏิบัติงาน",
        distanceKm: "",
        ratePerKm: isDerivedAmount(type) ? String(DEFAULT_RATE_PER_KM) : "",
        amount: "",
        attachmentId: null,
        attachmentIsImage: false,
      },
    ]);
  }

  async function confirm() {
    setSaving(true);
    setError(null);

    try {
      await apiSend(`/api/documents/${documentId}`, "PUT", {
        paymentType: "CASH",
        includeCertificate: true,
        items: items.map((item) => ({
          type: item.type,
          incurredOn: item.incurredOn,
          origin: hasRoute(item.type) ? item.origin || null : null,
          destination: hasRoute(item.type) ? item.destination || null : null,
          purpose: hasRoute(item.type) ? item.purpose || null : null,
          distanceKm: isDerivedAmount(item.type) ? toNumber(item.distanceKm) : null,
          ratePerKm: isDerivedAmount(item.type) ? toNumber(item.ratePerKm) : null,
          amount: isDerivedAmount(item.type) ? null : toNumber(item.amount),
          attachmentId: item.attachmentId,
        })),
      });
      router.push(`/create/${documentId}/sign`);
    } catch (cause) {
      setSaving(false);
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      );
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="ตรวจสอบข้อมูล" backHref={`/create/${documentId}/upload`} />

      <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-[18px] pb-6">
        <p className="m-0 text-xs leading-relaxed opacity-70">
          กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนดำเนินการต่อ
        </p>

        {error ? (
          <div className="border border-accent-500 bg-accent-100 p-3 text-xs text-accent-700">
            {error}
          </div>
        ) : null}

        {items.map((item) => (
          <ItemCard
            key={item.key}
            item={item}
            onPatch={(changes) => patch(item.key, changes)}
            onRemove={() =>
              setItems((current) => current.filter((entry) => entry.key !== item.key))
            }
          />
        ))}

        <div className="relative">
          <button
            type="button"
            onClick={() => setAddOpen((open) => !open)}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 border border-dashed border-divider bg-transparent p-2.5 text-xs font-bold"
            aria-expanded={addOpen}
          >
            <PlusIcon size={15} />
            เพิ่มรายการ
          </button>

          {addOpen ? (
            <div className="absolute inset-x-0 bottom-[calc(100%+4px)] z-10 border border-divider bg-white elev-md">
              {SUBTYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addItem(type)}
                  className="w-full cursor-pointer border-none border-b border-divider bg-transparent p-3 text-left text-[13px] font-semibold last:border-b-0"
                >
                  {ITEM_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 border-t-2 border-divider px-4 py-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-bold">ยอดรวมทั้งหมด</span>
          <span className="font-[family-name:var(--font-heading)] text-2xl font-extrabold text-accent-700">
            ฿{formatMoney(total)}
          </span>
        </div>
        <button
          type="button"
          onClick={confirm}
          disabled={incomplete || saving}
          className="btn btn-primary btn-block border border-transparent"
        >
          {saving ? "กำลังบันทึก…" : "ยืนยัน"}
        </button>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  onPatch,
  onRemove,
}: {
  item: EditableItem;
  onPatch: (changes: Partial<EditableItem>) => void;
  onRemove: () => void;
}) {
  const derived = isDerivedAmount(item.type);
  const routed = hasRoute(item.type);

  return (
    <div className="flex flex-col gap-[9px] border border-divider p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-extrabold tracking-wide uppercase">
          {ITEM_TYPE_LABELS[item.type]}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="cursor-pointer border-none bg-transparent p-1 text-accent-700"
          aria-label="ลบรายการนี้"
        >
          <TrashIcon />
        </button>
      </div>

      {item.attachmentId ? (
        item.attachmentIsImage ? (
          // Served through our own proxy with per-request authorisation, so it
          // cannot be optimised by next/image at build time.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/attachments/${item.attachmentId}/content`}
            alt="หลักฐานประกอบ"
            className="max-h-[140px] w-full border border-divider object-cover"
          />
        ) : (
          <a
            href={`/api/attachments/${item.attachmentId}/content`}
            target="_blank"
            rel="noreferrer"
            className="w-fit border border-divider bg-neutral-100 px-2 py-1 text-[11px]"
          >
            เปิดไฟล์แนบ
          </a>
        )
      ) : null}

      <Field label="วันที่">
        <input
          type="date"
          className="input"
          value={item.incurredOn}
          onChange={(event) => onPatch({ incurredOn: event.target.value })}
        />
      </Field>

      {routed ? (
        <>
          <Field label="ต้นทาง">
            <input
              className="input"
              value={item.origin}
              onChange={(event) => onPatch({ origin: event.target.value })}
            />
          </Field>
          <Field label="ปลายทาง">
            <input
              className="input"
              value={item.destination}
              onChange={(event) => onPatch({ destination: event.target.value })}
            />
          </Field>
        </>
      ) : null}

      {derived ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="อัตรา (บาท/กม.)">
              <input
                className="input"
                inputMode="decimal"
                value={item.ratePerKm}
                onChange={(event) => onPatch({ ratePerKm: event.target.value })}
              />
            </Field>
            <Field label="ระยะทาง (กม.)">
              <input
                className="input"
                inputMode="decimal"
                value={item.distanceKm}
                onChange={(event) => onPatch({ distanceKm: event.target.value })}
              />
            </Field>
          </div>
          <Field label="จำนวนเงิน (บาท)">
            {/* Derived, never typed — the server recomputes it either way. */}
            <input className="input" readOnly value={formatMoney(amountOf(item))} />
          </Field>
        </>
      ) : (
        <Field
          label={
            item.type === ExpenseItemType.TOLL
              ? "ค่าผ่านทางพิเศษ จำนวนเงิน (บาท)"
              : "จำนวนเงิน (บาท)"
          }
        >
          <input
            className="input"
            inputMode="decimal"
            value={item.amount}
            onChange={(event) => onPatch({ amount: event.target.value })}
            onBlur={() =>
              onPatch({ amount: item.amount ? formatMoney(toNumber(item.amount)) : "" })
            }
          />
        </Field>
      )}

      {routed ? (
        <Field label="เหตุผล">
          <input
            className="input"
            value={item.purpose}
            onChange={(event) => onPatch({ purpose: event.target.value })}
          />
        </Field>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="opacity-60">{label}</span>
      {children}
    </label>
  );
}
