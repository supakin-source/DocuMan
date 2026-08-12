import Image from "next/image";
import Link from "next/link";

import { requireUser, signOut } from "@/auth";
import { BottomNav } from "@/components/bottom-nav";
import { SignOutIcon } from "@/components/icons";
import { ScreenHeader } from "@/components/screen-header";
import { AppRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { countUnreadNotifications } from "@/lib/domain/notifications";
import { canApprove, isAdmin } from "@/lib/roles";

export const metadata = { title: "โปรไฟล์ · DocuMan" };

const ROLE_LABELS: Record<AppRole, string> = {
  [AppRole.REQUESTER]: "ผู้จัดทำ",
  [AppRole.APPROVER]: "ผู้อนุมัติ",
  [AppRole.ADMIN]: "ผู้ดูแลระบบ",
};

import { SignatureCard } from "./signature-card";

export default async function ProfilePage() {
  const user = await requireUser();

  const [profile, unread] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        image: true,
        roles: true,
        employeeCode: true,
        position: true,
        department: true,
        signature: true,
        approver: { select: { name: true, position: true } },
      },
    }),
    countUnreadNotifications(user.id),
  ]);

  const signature = profile.signature
    ? `data:image/png;base64,${Buffer.from(profile.signature).toString("base64")}`
    : null;

  const missing = !profile.employeeCode || !profile.position || !profile.approver;

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="โปรไฟล์" backHref={canApprove(user.roles) ? "/approve" : "/"} />

      <div className="no-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-4 pb-5">
        <div className="flex items-center gap-3">
          {profile.image ? (
            <Image
              src={profile.image}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center bg-neutral-200 font-[family-name:var(--font-heading)] text-xl font-extrabold">
              {(profile.name ?? profile.email).slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate font-[family-name:var(--font-heading)] text-lg font-extrabold">
              {profile.name ?? "—"}
            </div>
            <div className="truncate text-[11px] opacity-55">{profile.email}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {profile.roles.map((role) => (
                <span key={role} className="tag tag-neutral">
                  {ROLE_LABELS[role]}
                </span>
              ))}
            </div>
          </div>
        </div>

        <section className="border border-divider p-3">
          <h3 className="mb-2 text-[11px] font-normal opacity-50">ข้อมูลพนักงาน</h3>
          <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
            <Field label="รหัสพนักงาน" value={profile.employeeCode} />
            <Field label="ตำแหน่ง" value={profile.position} />
            <Field label="ฝ่าย/แผนก" value={profile.department} />
            <Field label="ผู้อนุมัติ" value={profile.approver?.name ?? null} />
          </dl>

          {missing ? (
            <p className="mt-2.5 mb-0 border border-accent-400 bg-accent-100 p-2.5 text-[11px] leading-relaxed text-accent-700">
              ข้อมูลยังไม่ครบ · กรุณาติดต่อผู้ดูแลระบบ
              {isAdmin(user.roles) ? (
                <>
                  {" "}
                  หรือ{" "}
                  <Link href="/admin" className="underline">
                    แก้ไขที่หน้าตั้งค่าผู้ใช้งาน
                  </Link>
                </>
              ) : null}
            </p>
          ) : (
            // The fields print on the document, so it matters that the person
            // reading them knows who to ask when one is wrong.
            <p className="mt-2.5 mb-0 text-[11px] opacity-45">
              ข้อมูลนี้พิมพ์ลงบนเอกสาร · แก้ไขได้โดยผู้ดูแลระบบ
            </p>
          )}
        </section>

        <SignatureCard current={signature} />

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="btn btn-secondary btn-block gap-2">
            <SignOutIcon />
            ออกจากระบบ
          </button>
        </form>

        <p className="m-0 text-center text-[10px] opacity-40">
          DocuMan · Version 0.1.0
          <br />
          Copyright © 2026 Asset Five Development Co., Ltd.
        </p>
      </div>

      <BottomNav
        variant={canApprove(user.roles) ? "approver" : "requester"}
        unreadCount={unread}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[11px] opacity-50">{label}</dt>
      <dd className={`m-0 font-bold ${value ? "" : "opacity-40"}`}>
        {value ?? "ยังไม่ได้ตั้งค่า"}
      </dd>
    </div>
  );
}
