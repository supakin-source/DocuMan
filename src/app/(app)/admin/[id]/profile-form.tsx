"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppRole } from "@/generated/prisma/enums";
import { ApiRequestError, apiSend } from "@/lib/client/api";

const ROLE_OPTIONS: { value: AppRole; label: string; hint: string }[] = [
  {
    value: AppRole.REQUESTER,
    label: "ผู้จัดทำ",
    hint: "สร้างและส่งเอกสารขออนุมัติได้",
  },
  {
    value: AppRole.APPROVER,
    label: "ผู้อนุมัติ",
    hint: "พิจารณาเอกสารของผู้ใต้บังคับบัญชาได้",
  },
  {
    value: AppRole.ADMIN,
    label: "ผู้ดูแลระบบ",
    hint: "แก้ไขข้อมูลผู้ใช้งานในหน้านี้ได้",
  },
];

export type ApproverOption = {
  id: string;
  name: string | null;
  email: string;
  position: string | null;
};

export function ProfileForm({
  userId,
  approvers,
  initial,
}: {
  userId: string;
  approvers: ApproverOption[];
  initial: {
    employeeCode: string;
    position: string;
    department: string;
    approverId: string;
    roles: AppRole[];
  };
}) {
  const router = useRouter();

  const [employeeCode, setEmployeeCode] = useState(initial.employeeCode);
  const [position, setPosition] = useState(initial.position);
  const [department, setDepartment] = useState(initial.department);
  const [approverId, setApproverId] = useState(initial.approverId);
  const [roles, setRoles] = useState<AppRole[]>(initial.roles);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleRole(role: AppRole, on: boolean) {
    setRoles((current) =>
      on ? [...new Set([...current, role])] : current.filter((entry) => entry !== role),
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await apiSend(`/api/admin/users/${userId}`, "PUT", {
        employeeCode,
        position,
        department,
        approverId,
        roles,
      });
      setSaved(true);
      // The list screen colours rows by completeness, so it needs re-reading.
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      );
    } finally {
      setSaving(false);
    }
  }

  // A requester with no approver cannot submit anything, so the form says so
  // rather than leaving it to be discovered at the end of the create flow.
  const blocksSubmission = roles.includes(AppRole.REQUESTER) && !approverId;

  return (
    <>
      <div className="no-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-[18px] pb-6">
        <div className="field">
          <label htmlFor="employeeCode">รหัสพนักงาน</label>
          <input
            id="employeeCode"
            className="input"
            placeholder="EMP-10234"
            value={employeeCode}
            onChange={(event) => {
              setEmployeeCode(event.target.value);
              setSaved(false);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="position">ตำแหน่ง</label>
          <input
            id="position"
            className="input"
            placeholder="เจ้าหน้าที่ขายอาวุโส"
            value={position}
            onChange={(event) => {
              setPosition(event.target.value);
              setSaved(false);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="department">ฝ่าย/แผนก</label>
          <input
            id="department"
            className="input"
            placeholder="ฝ่ายขาย"
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setSaved(false);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="approverId">ผู้อนุมัติ</label>
          <select
            id="approverId"
            className="input"
            value={approverId}
            onChange={(event) => {
              setApproverId(event.target.value);
              setSaved(false);
            }}
          >
            <option value="">— ยังไม่กำหนด —</option>
            {approvers.map((approver) => (
              <option key={approver.id} value={approver.id}>
                {approver.name ?? approver.email}
                {approver.position ? ` · ${approver.position}` : ""}
              </option>
            ))}
          </select>
        </div>

        {blocksSubmission ? (
          <div className="border border-accent-400 bg-accent-100 p-3 text-xs text-accent-700">
            ยังไม่ได้กำหนดผู้อนุมัติ · บัญชีนี้จะยังส่งเอกสารขออนุมัติไม่ได้
          </div>
        ) : null}

        <fieldset className="m-0 border border-divider p-3">
          <legend className="px-1 text-xs opacity-70">บทบาท</legend>
          <div className="flex flex-col gap-2.5">
            {ROLE_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer gap-2.5">
                <input
                  type="checkbox"
                  checked={roles.includes(option.value)}
                  onChange={(event) => toggleRole(option.value, event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{option.label}</span>
                  <span className="block text-[11px] opacity-55">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <div className="border border-accent-500 bg-accent-100 p-3 text-xs text-accent-700">
            {error}
          </div>
        ) : null}

        {saved ? (
          <div className="border border-divider bg-neutral-100 p-3 text-xs">
            บันทึกแล้ว
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t-2 border-divider px-4 py-3.5">
        <button
          type="button"
          onClick={save}
          disabled={saving || roles.length === 0}
          className="btn btn-primary btn-block border border-transparent"
        >
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </>
  );
}
