"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { ExpenseItemType } from "@/generated/prisma/enums";
import { CameraIcon, CloseIcon, FileIcon } from "@/components/icons";
import { ScreenHeader } from "@/components/screen-header";
import { ApiRequestError, apiSend, apiUpload } from "@/lib/client/api";
import type { ExpenseItemInput } from "@/lib/domain/items";

type Extraction = {
  type: ExpenseItemType;
  incurredOn: string | null;
  origin: string | null;
  destination: string | null;
  distanceKm: number | null;
  ratePerKm: number | null;
  amount: number | null;
  uncertain: boolean;
};

type UploadedFile = {
  /** Local key while in flight; the Drive id once stored. */
  key: string;
  name: string;
  status: "uploading" | "done" | "failed";
  previewUrl: string | null;
  driveFileId?: string;
  extraction?: Extraction | null;
};

export function UploadScreen({ documentId }: { documentId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const busy = saving || files.some((file) => file.status === "uploading");
  const ready = files.some((file) => file.status === "done");

  function pick(mode: "camera" | "file") {
    const input = inputRef.current;
    if (!input) return;

    if (mode === "camera") {
      input.setAttribute("capture", "environment");
      input.setAttribute("accept", "image/*");
    } else {
      input.removeAttribute("capture");
      input.setAttribute("accept", "image/*,application/pdf");
    }
    setMenuOpen(false);
    input.click();
  }

  async function onSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;

    setError(null);

    // Each file is uploaded and read on its own, so one bad scan does not sink
    // the others the user picked alongside it.
    await Promise.all(
      picked.map(async (file, index) => {
        const key = `${Date.now()}-${index}-${file.name}`;
        const previewUrl = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null;

        setFiles((current) => [
          ...current,
          { key, name: file.name, status: "uploading", previewUrl },
        ]);

        try {
          const result = await apiUpload<{
            attachment: { driveFileId: string; fileName: string };
            extraction: Extraction | null;
          }>(`/api/documents/${documentId}/attachments`, file);

          setFiles((current) =>
            current.map((entry) =>
              entry.key === key
                ? {
                    ...entry,
                    status: "done",
                    driveFileId: result.attachment.driveFileId,
                    extraction: result.extraction,
                  }
                : entry,
            ),
          );
        } catch (cause) {
          setFiles((current) =>
            current.map((entry) =>
              entry.key === key ? { ...entry, status: "failed" } : entry,
            ),
          );
          setError(
            cause instanceof ApiRequestError
              ? cause.message
              : "อัปโหลดล้มเหลว กรุณาลองใหม่อีกครั้ง",
          );
        }
      }),
    );
  }

  function remove(key: string) {
    setFiles((current) => {
      const target = current.find((entry) => entry.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((entry) => entry.key !== key);
    });
  }

  /** Turns each successful read into a draft line and moves to the review step. */
  async function confirm() {
    const usable = files.filter((file) => file.status === "done");
    if (usable.length === 0) return;

    setSaving(true);
    setError(null);

    const today = new Date().toISOString().slice(0, 10);
    const items: ExpenseItemInput[] = usable.map((file) => {
      const found = file.extraction;
      return {
        type: (found?.type ?? "PUBLIC_TRANSPORT") as ExpenseItemType,
        incurredOn: found?.incurredOn ?? today,
        origin: found?.origin ?? null,
        destination: found?.destination ?? null,
        purpose: "ไปปฏิบัติงาน",
        distanceKm: found?.distanceKm ?? null,
        ratePerKm: found?.ratePerKm ?? null,
        // A zero placeholder keeps the line visible for the user to correct;
        // submission is blocked until every line has a real amount.
        amount: found?.amount ?? 0,
        driveFileId: file.driveFileId ?? null,
      };
    });

    try {
      await apiSend(`/api/documents/${documentId}`, "PUT", {
        paymentType: "CASH",
        includeCertificate: true,
        items,
      });
      router.push(`/create/${documentId}/review`);
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
      <ScreenHeader title="อัปโหลดข้อมูล" backHref="/create" />

      <div className="no-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-5 pb-6">
        {error ? (
          <div className="flex items-center justify-between gap-2.5 border border-accent-500 bg-accent-100 p-3">
            <span className="text-xs text-accent-700">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="cursor-pointer border-none bg-transparent text-xs font-extrabold text-accent-700"
            >
              ปิด
            </button>
          </div>
        ) : null}

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex w-full cursor-pointer flex-col items-center gap-2.5 border border-dashed border-divider bg-transparent px-3.5 py-6"
            aria-expanded={menuOpen}
          >
            <CameraIcon />
            <span className="text-[13px] font-extrabold">ถ่ายภาพหรืออัปโหลดไฟล์</span>
            <span className="text-[11px] opacity-55">รองรับ JPG, PNG, PDF</span>
          </button>

          {menuOpen ? (
            <div className="absolute inset-x-0 top-[calc(100%+4px)] z-10 border border-divider bg-white elev-md">
              <button
                type="button"
                onClick={() => pick("camera")}
                className="w-full cursor-pointer border-none border-b border-divider bg-transparent p-3 text-left text-[13px] font-semibold"
              >
                ถ่ายภาพ
              </button>
              <button
                type="button"
                onClick={() => pick("file")}
                className="w-full cursor-pointer border-none bg-transparent p-3 text-left text-[13px] font-semibold"
              >
                อัปโหลดไฟล์
              </button>
            </div>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={onSelected}
          className="hidden"
        />

        {files.length > 0 ? (
          <div>
            <div className="mb-2 text-xs opacity-55">
              เอกสารที่แนบแล้ว ({files.length})
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {files.map((file) => (
                <li
                  key={file.key}
                  className="flex items-center gap-2.5 border border-divider p-2"
                >
                  {file.previewUrl ? (
                    // Object URL of a file the user just picked; next/image adds
                    // nothing over a 40px local thumbnail.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.previewUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-neutral-200">
                      <FileIcon size={18} />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{file.name}</div>
                    <div className="text-[10px] opacity-50">
                      {file.status === "uploading"
                        ? "กำลังอัปโหลดและอ่านข้อมูล…"
                        : file.status === "failed"
                          ? "อัปโหลดล้มเหลว"
                          : file.extraction?.uncertain
                            ? "อัปโหลดสำเร็จ · อ่านประเภทไม่ชัด กรุณาตรวจสอบ"
                            : file.extraction
                              ? "อัปโหลดสำเร็จ · อ่านข้อมูลแล้ว"
                              : "อัปโหลดสำเร็จ · กรอกข้อมูลเอง"}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(file.key)}
                    className="cursor-pointer border-none bg-transparent p-1 opacity-50"
                    aria-label={`ลบ ${file.name}`}
                  >
                    <CloseIcon />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t-2 border-divider px-4 py-3.5">
        <button
          type="button"
          onClick={confirm}
          disabled={!ready || busy}
          className="btn btn-primary btn-block border border-transparent"
        >
          {busy ? "ระบบกำลังอ่านข้อมูล..." : "ยืนยัน"}
        </button>
      </div>
    </div>
  );
}
