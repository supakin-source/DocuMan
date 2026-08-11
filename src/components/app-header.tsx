import Link from "next/link";

import { signOut } from "@/auth";
import { SettingsIcon, SignOutIcon, SwitchIcon } from "@/components/icons";

/**
 * The dashboard header: who you are, plus the role switch and sign-out.
 *
 * The switch only appears for an account that genuinely holds both roles — an
 * approver-only account has nothing to switch to.
 */
export function AppHeader({
  name,
  subtitle,
  switchTo,
  badgeCount = 0,
  showAdmin = false,
}: {
  name: string;
  subtitle: string;
  /** Where the role switch leads, or null to hide it. */
  switchTo: { href: string; label: string } | null;
  /** Count shown on the switch, e.g. documents waiting in the other view. */
  badgeCount?: number;
  /** Whether to offer the user-administration screen. */
  showAdmin?: boolean;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-divider px-4 pt-[22px] pb-4">
      <div className="min-w-0">
        <h2 className="m-0 truncate text-[22px]">{name}</h2>
        <p className="mt-1.5 mb-0 truncate text-xs opacity-60">{subtitle}</p>
      </div>

      <div className="flex shrink-0 gap-2">
        {showAdmin ? (
          <Link href="/admin" title="ตั้งค่าผู้ใช้งาน" className="icon-btn">
            <SettingsIcon />
            <span className="sr-only">ตั้งค่าผู้ใช้งาน</span>
          </Link>
        ) : null}

        {switchTo ? (
          <Link href={switchTo.href} title={switchTo.label} className="icon-btn relative">
            <SwitchIcon />
            {badgeCount > 0 ? (
              <span className="absolute -top-[7px] -right-[7px] flex h-[18px] min-w-[18px] items-center justify-center bg-accent px-1 font-[family-name:var(--font-heading)] text-[10px] font-extrabold text-white">
                {badgeCount}
              </span>
            ) : null}
            <span className="sr-only">{switchTo.label}</span>
          </Link>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="icon-btn" title="ออกจากระบบ">
            <SignOutIcon />
            <span className="sr-only">ออกจากระบบ</span>
          </button>
        </form>
      </div>
    </header>
  );
}
