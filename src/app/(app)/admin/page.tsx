import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/auth";
import { ChevronRightIcon } from "@/components/icons";
import { ScreenHeader } from "@/components/screen-header";
import { AppRole } from "@/generated/prisma/enums";
import { listUsers } from "@/lib/domain/users";
import { isAdmin } from "@/lib/roles";

export const metadata = { title: "ตั้งค่าผู้ใช้งาน · DocuMan" };

const ROLE_LABELS: Record<AppRole, string> = {
  [AppRole.REQUESTER]: "ผู้จัดทำ",
  [AppRole.APPROVER]: "ผู้อนุมัติ",
  [AppRole.ADMIN]: "ผู้ดูแลระบบ",
};

export default async function AdminPage() {
  const actor = await requireUser();
  if (!isAdmin(actor.roles)) redirect("/");

  const users = await listUsers();

  // The fields a document prints and cannot get from Google sign-in. Someone
  // missing any of them cannot submit, so they are called out first.
  const incomplete = users.filter(
    (user) =>
      user.roles.includes(AppRole.REQUESTER) &&
      (!user.employeeCode || !user.position || !user.approverId),
  );

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="ตั้งค่าผู้ใช้งาน" backHref="/" />

      <div className="no-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-[18px] pb-6">
        {incomplete.length > 0 ? (
          <div className="border border-accent-400 bg-accent-100 p-3">
            <div className="mb-1 text-[11px] font-extrabold text-accent-700">
              ตั้งค่ายังไม่ครบ {incomplete.length} บัญชี
            </div>
            <div className="text-xs text-accent-700">
              บัญชีที่ยังไม่มีรหัสพนักงาน ตำแหน่ง หรือผู้อนุมัติ
              จะยังส่งเอกสารขออนุมัติไม่ได้
            </div>
          </div>
        ) : null}

        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {users.map((user) => {
            const missing =
              user.roles.includes(AppRole.REQUESTER) &&
              (!user.employeeCode || !user.position || !user.approverId);

            return (
              <li key={user.id}>
                <Link
                  href={`/admin/${user.id}`}
                  className={`flex items-center gap-3 border p-3 text-inherit no-underline ${
                    missing ? "border-accent-400 bg-accent-100" : "border-divider"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-[family-name:var(--font-heading)] text-sm font-extrabold">
                      {user.name ?? user.email}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] opacity-55">
                      {user.employeeCode ? `${user.employeeCode} · ` : ""}
                      {user.position ?? "ยังไม่ได้ตั้งตำแหน่ง"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <span key={role} className="tag tag-neutral">
                          {ROLE_LABELS[role]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronRightIcon className="shrink-0 opacity-40" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
