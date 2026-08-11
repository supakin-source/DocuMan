import Image from "next/image";
import Link from "next/link";

import { requireUser } from "@/auth";
import { getDocumentFor } from "@/lib/domain/documents";

export const metadata = { title: "ส่งเอกสารสำเร็จ · DocuMan" };

export default async function SuccessPage({ params }: PageProps<"/create/[id]/success">) {
  const user = await requireUser();
  const { id } = await params;
  const document = await getDocumentFor(id, user.id);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-7 py-8 text-center">
      <Image
        src="/brand/success.png"
        alt=""
        width={170}
        height={170}
        priority
        className="h-auto w-[170px]"
      />
      <h2 className="m-0 text-xl">ส่งเอกสารสำเร็จ</h2>
      {document.docNo ? (
        <p className="m-0 text-xs opacity-60">เลขที่เอกสาร {document.docNo}</p>
      ) : null}

      <div className="mt-5 flex w-full flex-col gap-2">
        <Link href="/" className="btn btn-primary btn-block border border-transparent">
          กลับหน้าหลัก
        </Link>
        <Link href={`/documents/${id}`} className="btn btn-secondary btn-block">
          ดูเอกสาร
        </Link>
      </div>
    </div>
  );
}
