import { redirect } from "next/navigation";

import { requireUser } from "@/auth";
import { ScreenHeader } from "@/components/screen-header";
import { getUserForAdmin, listApproverCandidates } from "@/lib/domain/users";
import { isAdmin } from "@/lib/roles";

export const metadata = { title: "แก้ไขผู้ใช้งาน · DocuMan" };

import { ProfileForm } from "./profile-form";

export default async function AdminUserPage({ params }: PageProps<"/admin/[id]">) {
  const actor = await requireUser();
  if (!isAdmin(actor.roles)) redirect("/");

  const { id } = await params;
  const [user, approvers] = await Promise.all([
    getUserForAdmin(id),
    listApproverCandidates(),
  ]);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title={user.name ?? user.email} backHref="/admin" />

      <div className="shrink-0 border-b border-divider px-4 py-2.5 text-[11px] opacity-55">
        {user.email}
      </div>

      <ProfileForm
        userId={user.id}
        // An account cannot be its own approver, so it is not offered.
        approvers={approvers.filter((candidate) => candidate.id !== user.id)}
        initial={{
          employeeCode: user.employeeCode ?? "",
          position: user.position ?? "",
          department: user.department ?? "",
          approverId: user.approverId ?? "",
          roles: user.roles,
        }}
      />
    </div>
  );
}
