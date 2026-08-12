import Image from "next/image";

import { ExpenseStatus } from "@/generated/prisma/enums";
import type { DocumentDetail } from "@/lib/domain/documents";
import { hasRoute, isDerivedAmount, ITEM_TYPE_LABELS } from "@/lib/domain/items";
import { formatMoney, formatThaiDate, thaiBahtText } from "@/lib/thai";

/** A4 at 96 dpi. The sheets are laid out at this width and scaled to fit. */
export const A4_WIDTH = 794;

const COMPANY_TH = "บริษัท แอสเซท ไฟว์ ดีเวลลอปเม้นท์ จำกัด";
const COMPANY_EN = "Asset Five Development Co., Ltd.";
const ADDRESS_TH =
  "เลขที่ 199 อาคาร เอส โอเอซิส ชั้น 12 ห้องเลขที่ 1210, 1211, 1212 ถนนวิภาวดีรังสิต แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900";
const ADDRESS_EN =
  "199 S-OASIS Building, 12th Floor, Unit 1210, 1211, 1212, Vibhavadi-Rangsit Rd., Chomphol, Chatuchak, Bangkok 10900";
const TAX_ID = "010555614282";

/** Blank rows padding the certificate table so the form keeps its printed shape. */
const CERTIFICATE_MIN_ROWS = 8;

function signatureSrc(bytes: Uint8Array | null | undefined): string | null {
  if (!bytes || bytes.byteLength === 0) return null;
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * The printable document: a detail sheet, optionally followed by
 * ใบรับรองแทนใบเสร็จรับเงิน.
 *
 * Laid out as a continuous A4-width flow with `break-inside: avoid` on each
 * block rather than the prototype's measured pagination. The browser's own
 * paginator then splits pages when printing or exporting to PDF, which keeps
 * long claims correct at any content length instead of relying on measurements
 * taken at one particular zoom.
 */
export function DocumentSheet({
  document,
  showCertificate,
}: {
  document: DocumentDetail;
  showCertificate: boolean;
}) {
  return (
    <>
      <DetailSheet document={document} />
      {showCertificate ? <CertificateSheet document={document} /> : null}
    </>
  );
}

function Sheet({
  children,
  variant = "detail",
}: {
  children: React.ReactNode;
  variant?: "detail" | "certificate";
}) {
  return (
    <section
      style={{ width: A4_WIDTH }}
      className={`
        shrink-0 border border-divider bg-white elev-md
        print:border-0 print:shadow-none print:break-after-page
        ${variant === "certificate" ? "p-14 font-[family-name:var(--font-document)] text-black" : "p-12"}
      `}
    >
      {children}
    </section>
  );
}

export function DetailSheet({ document }: { document: DocumentDetail }) {
  const total = Number(document.totalAmount);
  const requesterMark = signatureSrc(document.requesterSignature);
  const approverMark = signatureSrc(document.approverSignature);

  return (
    <Sheet>
      <header className="mb-3 flex items-start justify-between gap-4 border-b-2 border-divider pb-3 break-inside-avoid">
        <div>
          <div className="font-[family-name:var(--font-heading)] text-sm font-extrabold">
            {COMPANY_TH}
          </div>
          <div className="mt-0.5 font-[family-name:var(--font-heading)] text-[11px] font-extrabold opacity-60">
            {COMPANY_EN}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] opacity-55">เลขที่เอกสาร</div>
          <div className="font-[family-name:var(--font-heading)] text-[13px] font-extrabold">
            {document.docNo ?? "—"}
          </div>
        </div>
      </header>

      <h3 className="mt-0 mb-3.5 text-center text-lg break-inside-avoid">
        เอกสารแสดงรายละเอียดค่าเดินทาง
      </h3>

      <dl className="mb-3.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs break-inside-avoid">
        <Meta label="ผู้ขอเบิก" value={document.owner.name ?? "—"} />
        <Meta label="ตำแหน่ง" value={document.owner.position ?? "—"} />
        <Meta label="รหัสพนักงาน" value={document.owner.employeeCode ?? "—"} />
        <Meta
          label="วันที่"
          value={formatThaiDate(document.submittedAt ?? document.createdAt)}
        />
      </dl>

      <div className="mb-3.5 border border-divider p-3 break-inside-avoid">
        <div className="flex items-baseline justify-between">
          <span className="text-xs opacity-60">จำนวนเงินรวม</span>
          <span className="font-[family-name:var(--font-heading)] text-[22px] font-extrabold">
            ฿{formatMoney(total)}
          </span>
        </div>
        <div className="mt-1 text-right text-[11px] opacity-55">
          ({thaiBahtText(total)})
        </div>
      </div>

      <div className="mb-3.5">
        <div className="mb-1.5 text-[11px] opacity-50">รายละเอียด</div>
        <div className="flex flex-col gap-2">
          {document.items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-4 border border-divider p-3.5 break-inside-avoid"
            >
              {item.attachment ? (
                <div className="w-[35%] shrink-0">
                  {item.attachment.mimeType.startsWith("image/") ? (
                    // Authorised per request through our own proxy, so it cannot
                    // go through next/image's optimiser.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/attachments/${item.attachment.id}/content`}
                      alt=""
                      className="w-full border border-divider"
                    />
                  ) : (
                    <div className="truncate border border-divider px-2 py-1 text-[10px]">
                      {item.attachment.fileName}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px]">
                <div className="font-extrabold tracking-wide uppercase">
                  {ITEM_TYPE_LABELS[item.type]}
                </div>
                <div>
                  <span className="opacity-50">วันที่</span>{" "}
                  {formatThaiDate(item.incurredOn)}
                </div>
                {hasRoute(item.type) ? (
                  <>
                    <div>
                      <span className="opacity-50">ต้นทาง</span> {item.origin ?? "—"}
                    </div>
                    <div>
                      <span className="opacity-50">ปลายทาง</span>{" "}
                      {item.destination ?? "—"}
                    </div>
                  </>
                ) : null}
                {isDerivedAmount(item.type) ? (
                  <div>
                    <span className="opacity-50">อัตรา</span>{" "}
                    {Number(item.ratePerKm ?? 0)} บาท/กม. ·{" "}
                    <span className="opacity-50">ระยะทาง</span>{" "}
                    {Number(item.distanceKm ?? 0)} กม.
                  </div>
                ) : null}
                {hasRoute(item.type) ? (
                  <div>
                    <span className="opacity-50">เหตุผล</span> {item.purpose ?? "—"}
                  </div>
                ) : null}
                <div className="font-extrabold">฿{formatMoney(Number(item.amount))}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 break-inside-avoid">
        <SignatureBlock
          role="ผู้จัดทำ"
          mark={requesterMark}
          name={document.owner.name ?? ""}
          when={
            document.submittedAt
              ? `ลงนามแล้ว · ${formatThaiDate(document.submittedAt)}`
              : null
          }
          pendingText="ยังไม่ได้ลงลายเซ็น"
        />
        <SignatureBlock
          role="ผู้ตรวจสอบ/ผู้อนุมัติ"
          mark={document.status === ExpenseStatus.APPROVED ? approverMark : null}
          name={document.decidedBy?.name ?? document.owner.approver?.name ?? ""}
          when={
            document.status === ExpenseStatus.APPROVED && document.decidedAt
              ? `อนุมัติแล้ว · ${formatThaiDate(document.decidedAt)}`
              : null
          }
          pendingText={
            document.status === ExpenseStatus.REJECTED
              ? "ไม่อนุมัติ"
              : document.status === ExpenseStatus.CORRECTION
                ? "ส่งกลับให้แก้ไข"
                : "รอการอนุมัติ"
          }
        />
      </div>
    </Sheet>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline opacity-50">{label}</dt>
      <dd className="m-0 font-bold">{value}</dd>
    </div>
  );
}

function SignatureBlock({
  role,
  mark,
  name,
  when,
  pendingText,
}: {
  role: string;
  mark: string | null;
  name: string;
  when: string | null;
  pendingText: string;
}) {
  return (
    <div className="border-t border-divider pt-1.5">
      <div className="text-[10px] opacity-50">{role}</div>
      {mark ? (
        <>
          <Image
            src={mark}
            alt=""
            width={200}
            height={44}
            unoptimized
            className="max-h-11 w-full object-contain"
          />
          <div className="mt-0.5 text-[10px]">{name}</div>
          {when ? <div className="text-[9px] opacity-50">{when}</div> : null}
        </>
      ) : (
        <div className="mt-1 text-[11px] italic opacity-50">{pendingText}</div>
      )}
    </div>
  );
}

export function CertificateSheet({ document }: { document: DocumentDetail }) {
  const total = Number(document.totalAmount);
  const requesterMark = signatureSrc(document.requesterSignature);
  const approverMark =
    document.status === ExpenseStatus.APPROVED
      ? signatureSrc(document.approverSignature)
      : null;

  const rows = document.items.map((item, index) => ({
    no: index + 1,
    date: formatThaiDate(item.incurredOn),
    detail:
      item.type === "TOLL"
        ? "ค่าผ่านทางพิเศษ"
        : `${item.type === "PERSONAL_VEHICLE" ? "ค่าเดินทาง" : "ค่าโดยสาร"}${
            item.purpose ?? ""
          } จาก${item.origin ?? "—"}ไป${item.destination ?? "—"}`,
    amount: formatMoney(Number(item.amount)),
  }));

  const blanks = Math.max(0, CERTIFICATE_MIN_ROWS - rows.length);
  const dates = document.items.map((item) => item.incurredOn);
  const approverName = document.decidedBy?.name ?? document.owner.approver?.name ?? "";

  return (
    <Sheet variant="certificate">
      <Image
        src="/brand/assetfive-wordmark.png"
        alt={COMPANY_EN}
        width={215}
        height={30}
        className="mx-auto mt-2 w-[215px]"
      />

      <div className="mt-[30px] text-center">
        <div className="text-[13px] leading-relaxed">
          {COMPANY_TH} {ADDRESS_TH}
        </div>
        <div className="mt-1 text-[12.5px] leading-relaxed">
          {COMPANY_EN} {ADDRESS_EN}
        </div>
        <div className="mt-1 text-[13px]">เลขประจำตัวผู้เสียภาษี {TAX_ID}</div>
      </div>

      <h2 className="mt-6 mb-[26px] text-center text-base font-bold">
        ใบรับรองแทนใบเสร็จรับเงิน
      </h2>

      <table className="w-full table-fixed border-collapse text-[15px]">
        <thead>
          <tr className="bg-[#d9d9d9]">
            <th className="w-[7.4%] border border-black p-[5px] font-bold">ลำดับ</th>
            <th className="w-[15.4%] border border-black p-[5px] font-bold">
              วัน เดือน ปี
            </th>
            <th className="w-[45.3%] border border-black p-[5px] font-bold">
              รายละเอียดการจ่าย
            </th>
            <th className="w-[13.4%] border border-black p-[5px] font-bold">จำนวนเงิน</th>
            <th className="w-[18.5%] border border-black p-[5px] font-bold">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.no}>
              <td className="h-8 border border-black px-1.5 py-1 text-center">{row.no}</td>
              <td className="border border-black px-1.5 py-1 text-center">{row.date}</td>
              <td className="border border-black px-1.5 py-1">{row.detail}</td>
              <td className="border border-black px-1.5 py-1 text-right">{row.amount}</td>
              <td className="border border-black px-1.5 py-1" />
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, index) => (
            <tr key={`blank-${index}`}>
              <td className="h-8 border border-black" />
              <td className="border border-black" />
              <td className="border border-black" />
              <td className="border border-black" />
              <td className="border border-black" />
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-stretch text-[15px]">
        <div className="flex h-[30px] w-[68.1%] items-center justify-center border border-t-0 border-black bg-[#d9d9d9]">
          {thaiBahtText(total)}
        </div>
        <div className="flex w-[13.4%] items-center justify-end pr-2 font-bold">
          รวมทั้งสิ้น
        </div>
        <div className="flex h-[30px] w-[18.5%] items-center justify-end border border-t-0 border-black bg-[#d9d9d9] pr-2">
          {formatMoney(total)}
        </div>
      </div>

      <div className="mt-7 text-[13px]">
        <div className="flex items-end gap-2">
          <span className="pl-[100px]">ข้าพเจ้า</span>
          <span className="flex-1 border-b border-dotted border-black text-center">
            {document.owner.name}
          </span>
          <span>ตำแหน่ง</span>
          <span className="flex-1 border-b border-dotted border-black text-center">
            {document.owner.position ?? ""}
          </span>
        </div>
        <div className="mt-4 leading-[1.7]">
          ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับเงินได้
          และข้าพเจ้าได้จ่ายไปในงานของ{COMPANY_TH} โดยแท้
        </div>
        <div className="mt-3.5 flex items-end gap-2">
          <span>ตั้งแต่วันที่</span>
          <span className="w-[170px] border-b border-dotted border-black text-center">
            {formatThaiDate(dates.at(0))}
          </span>
          <span>ถึงวันที่</span>
          <span className="w-[190px] border-b border-dotted border-black text-center">
            {formatThaiDate(dates.at(-1))}
          </span>
        </div>
      </div>

      <div className="mt-10 pb-0.5 text-[13px]">
        <CertificateSignature label="(ผู้เบิกจ่าย)" mark={requesterMark} name={document.owner.name ?? ""} />
        <div className="mt-4">
          <CertificateSignature label="(ผู้อนุมัติ)" mark={approverMark} name={approverName} />
        </div>
      </div>
    </Sheet>
  );
}

function CertificateSignature({
  label,
  mark,
  name,
}: {
  label: string;
  mark: string | null;
  name: string;
}) {
  return (
    <>
      <div className="flex items-end justify-end gap-2">
        <span>ลงชื่อ</span>
        <span className="flex h-[46px] w-[203px] items-end justify-center border-b border-dashed border-black">
          {mark ? (
            <Image
              src={mark}
              alt=""
              width={203}
              height={44}
              unoptimized
              className="max-h-11 w-full object-contain"
            />
          ) : (
            " "
          )}
        </span>
        <span className="w-20">{label}</span>
      </div>
      <div className="mt-[3px] flex justify-end">
        <span className="w-[203px] text-center">( {name} )</span>
        <span className="w-[88px]" />
      </div>
    </>
  );
}
