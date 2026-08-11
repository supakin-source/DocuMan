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
import { useToast } from "@/components/toast";

type NavItem = {
  label: string;
  icon: ReactNode;
  href?: string;
};

const REQUESTER_ITEMS: NavItem[] = [
  { label: "หน้าหลัก", icon: <HomeIcon />, href: "/" },
  { label: "สร้างเอกสาร", icon: <PlusIcon />, href: "/create" },
  { label: "เอกสารของฉัน", icon: <FileIcon /> },
  { label: "แจ้งเตือน", icon: <BellIcon /> },
  { label: "โปรไฟล์", icon: <UserIcon /> },
];

const APPROVER_ITEMS: NavItem[] = [
  { label: "หน้าหลัก", icon: <HomeIcon />, href: "/approve" },
  { label: "ประวัติ", icon: <ClockIcon /> },
  { label: "แจ้งเตือน", icon: <BellIcon /> },
  { label: "โปรไฟล์", icon: <UserIcon /> },
];

/**
 * The tab bar. Items without an href are in the design but not yet built; they
 * say so when tapped rather than being hidden, matching the prototype.
 */
export function BottomNav({ variant }: { variant: "requester" | "approver" }) {
  const pathname = usePathname();
  const toast = useToast();
  const items = variant === "approver" ? APPROVER_ITEMS : REQUESTER_ITEMS;

  return (
    <nav className="flex shrink-0 border-t-2 border-divider">
      {items.map((item) => {
        const active = item.href === pathname;
        const className = `flex-1 px-1 pt-2.5 pb-3 text-center ${
          item.href ? "text-text" : "text-neutral-500"
        }`;
        const body = (
          <>
            <span className="mx-auto block w-fit">{item.icon}</span>
            <span
              className={`mt-[3px] block text-[10px] ${active ? "font-extrabold" : ""}`}
            >
              {item.label}
            </span>
          </>
        );

        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className={className}
            aria-current={active ? "page" : undefined}
          >
            {body}
          </Link>
        ) : (
          <button
            key={item.label}
            type="button"
            className={className}
            onClick={() => toast("ฟีเจอร์นี้จะเปิดใช้งานเร็ว ๆ นี้")}
          >
            {body}
          </button>
        );
      })}
    </nav>
  );
}
