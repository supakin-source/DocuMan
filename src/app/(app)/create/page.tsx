import { redirect } from "next/navigation";

import { requireUser } from "@/auth";
import { PinIcon } from "@/components/icons";
import { ScreenHeader } from "@/components/screen-header";
import { createDraft } from "@/lib/domain/documents";

export const metadata = { title: "สร้างเอกสารใหม่ · DocuMan" };

/**
 * Category picker. The design ships one category — ค่าเดินทาง — and the choice
 * between personal vehicle, public transport and toll is made per line on the
 * review screen, so this is a one-tile grid rather than a fake menu.
 */
export default function CreatePage() {
  async function start() {
    "use server";
    const user = await requireUser();
    const id = await createDraft(user.id);
    redirect(`/create/${id}/upload`);
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="สร้างเอกสารใหม่" backHref="/" />

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pt-5 pb-6">
        <p className="mt-0 mb-4 font-[family-name:var(--font-heading)] text-[15px] font-extrabold">
          รายการค่าใช้จ่ายนี้เกี่ยวกับอะไร?
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <form action={start}>
            <button
              type="submit"
              className="flex w-full cursor-pointer flex-col items-start gap-2.5 border border-divider bg-transparent px-2.5 py-4 text-left"
            >
              <span className="flex h-[34px] w-[34px] items-center justify-center bg-neutral-200">
                <PinIcon />
              </span>
              <span className="text-[13px] font-semibold">ค่าเดินทาง</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
