"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  BellIcon,
  ClockIcon,
  FileIcon,
  HomeIcon,
  PlusIcon,
  UserIcon,
} from "@/components/icons";

type NavItem = {
  label: string;
  icon: ReactNode;
  href: string;
  /** Marks the tab active for its whole subtree, not just the exact path. */
  matchPrefix?: string;
};

const REQUESTER_ITEMS: NavItem[] = [
  { label: "หน้าหลัก", icon: <HomeIcon />, href: "/" },
  { label: "สร้างเอกสาร", icon: <PlusIcon />, href: "/create", matchPrefix: "/create" },
  {
    label: "เอกสารของฉัน",
    icon: <FileIcon />,
    href: "/documents",
    matchPrefix: "/documents",
  },
  { label: "แจ้งเตือน", icon: <BellIcon />, href: "/notifications" },
  { label: "โปรไฟล์", icon: <UserIcon />, href: "/profile" },
];

const APPROVER_ITEMS: NavItem[] = [
  { label: "หน้าหลัก", icon: <HomeIcon />, href: "/approve" },
  { label: "ประวัติ", icon: <ClockIcon />, href: "/approve/history" },
  { label: "แจ้งเตือน", icon: <BellIcon />, href: "/notifications" },
  { label: "โปรไฟล์", icon: <UserIcon />, href: "/profile" },
];

export function BottomNav({
  variant,
  unreadCount = 0,
}: {
  variant: "requester" | "approver";
  /** Badged on the notifications tab. */
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const items = variant === "approver" ? APPROVER_ITEMS : REQUESTER_ITEMS;

  return (
    <nav className="flex shrink-0 border-t-2 border-divider">
      {items.map((item) => {
        // The approver's home is /approve, which is also the prefix of
        // /approve/history — so an exact match is required unless asked for.
        const active = item.matchPrefix
          ? pathname === item.href || pathname.startsWith(`${item.matchPrefix}/`)
          : pathname === item.href;

        const badge = item.href === "/notifications" ? unreadCount : 0;

        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex-1 px-1 pt-2.5 pb-3 text-center text-text"
          >
            <span className="relative mx-auto block w-fit">
              {item.icon}
              {badge > 0 ? (
                <span className="absolute -top-1.5 -right-2.5 flex h-[15px] min-w-[15px] items-center justify-center bg-accent px-1 font-[family-name:var(--font-heading)] text-[9px] font-extrabold text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              ) : null}
            </span>
            <span
              className={`mt-[3px] block text-[10px] ${active ? "font-extrabold" : ""}`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
