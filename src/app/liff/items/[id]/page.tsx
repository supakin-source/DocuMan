"use client";

import { use, useEffect, useState } from "react";

import { closeLiff, liffFetch } from "@/app/liff/liff-provider";
import {
  Field,
  LiffScreen,
  Notice,
  Placeholder,
  inputClass,
  primaryButtonClass,
} from "@/app/liff/liff-screen";
import { ReceiptImage } from "@/app/liff/receipt-image";
import { ExpenseItemType } from "@/generated/prisma/enums";
import {
  DEFAULT_RATE_PER_KM,
  ITEM_TYPE_LABELS,
  computeItemAmount,
  hasRoute,
  isDerivedAmount,
} from "@/lib/domain/items";
import { formatMoney } from "@/lib/thai";

/**
 * Correcting what OCR read.
 *
 * This screen is the reason the bot is allowed to store an incomplete line at
 * all: a model that misreads a crumpled receipt should hand the user something
 * to fix rather than refuse the upload. The receipt itself is shown beside the
 * fields, because the only way to check a number is against the paper it came
 * from.
 */

type Item = {
  id: string;
  type: ExpenseItemType;
  incurredOn: string;
  origin: string | null;
  destination: string | null;
  purpose: string | null;
  distanceKm: number | null;
  ratePerKm: number | null;
  amount: number;
  attachmentId: string | null;
};

export default function ItemPage({ params }: PageProps<"/liff/items/[id]">) {
  const { id } = use(params);

  return (
    <LiffScreen title="แก้ไขรายการ" hint="ตรวจสอบกับไฟล์แนบด้านล่าง แล้วแก้ให้ตรง">
      {({ idToken }) => <ItemForm idToken={idToken} itemId={id} />}
    </LiffScreen>
  );
}

function ItemForm({ idToken, itemId }: { idToken: string; itemId: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [editable, setEditable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    liffFetch(idToken, `/api/liff/items/${itemId}`)
      .then(async (response) => {
        const body = (await response.json()) as
          | { item: Item; editable: boolean }
          | { error: string };
        if (!response.ok) throw new Error("error" in body ? body.error : "โหลดไม่สำเร็จ");
        return body as { item: Item; editable: boolean };
      })
      .then((data) => {
        if (cancelled) return;
        setItem(data.item);
        setEditable(data.editable);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "โหลดไม่สำเร็จ");
      });

    return () => {
      cancelled = true;
    };
  }, [idToken, itemId]);

  if (error && !item) return <Notice>{error}</Notice>;
  if (!item) return <Placeholder>กำลังโหลดรายการ…</Placeholder>;

  const derived = isDerivedAmount(item.type);
  const routed = hasRoute(item.type);
  const amount = computeItemAmount(item);

  function patch(changes: Partial<Item>) {
    setItem((current) => (current ? { ...current, ...changes } : current));
    setSaved(false);
  }

  /** Empty means "not filled in", which is a null and not a zero. */
  function toNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  async function save() {
    if (!item) return;

    setSaving(true);
    setError(null);

    try {
      const response = await liffFetch(idToken, `/api/liff/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({
          type: item.type,
          incurredOn: item.incurredOn,
          origin: item.origin,
          destination: item.destination,
          purpose: item.purpose,
          distanceKm: item.distanceKm,
          ratePerKm: item.ratePerKm,
          amount: item.amount,
        }),
      });

      if (!response.ok) {
        throw new Error(((await response.json()) as { error?: string }).error);
      }

      setSaved(true);
      setTimeout(closeLiff, 900);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!editable ? <Notice>เอกสารนี้ส่งอนุมัติแล้ว แก้ไขไม่ได้</Notice> : null}

      {item.attachmentId ? (
        <ReceiptImage idToken={idToken} attachmentId={item.attachmentId} />
      ) : null}

      <Field label="ประเภท">
        <select
          className={inputClass}
          value={item.type}
          disabled={!editable}
          onChange={(event) => {
            const type = event.target.value as ExpenseItemType;
            patch({
              type,
              // A line that becomes mileage needs the company rate, which is
              // policy rather than anything printed on the receipt.
              ratePerKm: isDerivedAmount(type) ? (item.ratePerKm ?? DEFAULT_RATE_PER_KM) : null,
            });
          }}
        >
          {Object.entries(ITEM_TYPE_LABELS).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </Field>

      <Field label="วันที่">
        <input
          type="date"
          className={inputClass}
          value={item.incurredOn}
          disabled={!editable}
          onChange={(event) => patch({ incurredOn: event.target.value })}
        />
      </Field>

      {routed ? (
        <>
          <Field label="ต้นทาง">
            <input
              className={inputClass}
              value={item.origin ?? ""}
              disabled={!editable}
              placeholder="ชื่อสถานที่"
              onChange={(event) => patch({ origin: event.target.value || null })}
            />
          </Field>
          <Field label="ปลายทาง">
            <input
              className={inputClass}
              value={item.destination ?? ""}
              disabled={!editable}
              placeholder="ชื่อสถานที่"
              onChange={(event) => patch({ destination: event.target.value || null })}
            />
          </Field>
          <Field label="วัตถุประสงค์">
            <input
              className={inputClass}
              value={item.purpose ?? ""}
              disabled={!editable}
              onChange={(event) => patch({ purpose: event.target.value || null })}
            />
          </Field>
        </>
      ) : null}

      {derived ? (
        <>
          <Field label="ระยะทาง (กม.)">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              className={inputClass}
              value={item.distanceKm ?? ""}
              disabled={!editable}
              onChange={(event) => patch({ distanceKm: toNumber(event.target.value) })}
            />
          </Field>
          <Field label="อัตราต่อกิโลเมตร (บาท)">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              className={inputClass}
              value={item.ratePerKm ?? ""}
              disabled={!editable}
              onChange={(event) => patch({ ratePerKm: toNumber(event.target.value) })}
            />
          </Field>
          <p className="rounded-md bg-surface px-3 py-2 text-sm">
            จำนวนเงิน <strong>฿{formatMoney(amount)}</strong>
            <span className="ml-2 text-xs text-neutral-600">
              คิดจากระยะทาง × อัตรา ตามระเบียบบริษัท
            </span>
          </p>
        </>
      ) : (
        <Field label="จำนวนเงิน (บาท)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className={inputClass}
            value={item.amount || ""}
            disabled={!editable}
            onChange={(event) => patch({ amount: toNumber(event.target.value) ?? 0 })}
          />
        </Field>
      )}

      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Notice>บันทึกแล้ว</Notice> : null}

      <button
        type="button"
        className={primaryButtonClass}
        disabled={!editable || saving}
        onClick={save}
      >
        {saving ? "กำลังบันทึก…" : "บันทึก"}
      </button>
    </div>
  );
}
