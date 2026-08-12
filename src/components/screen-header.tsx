"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { ChevronLeftIcon } from "@/components/icons";

/**
 * The centred title bar every inner screen carries, with a back control on the
 * left and a matching spacer on the right so the title stays optically centred.
 */
export function ScreenHeader({
  title,
  backHref,
  onBack,
  action,
}: {
  title: ReactNode;
  /** Where the back control goes. Falls back to browser history. */
  backHref?: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  const router = useRouter();

  function goBack() {
    if (onBack) return onBack();
    if (backHref) return router.push(backHref);
    router.back();
  }

  return (
    <header className="flex shrink-0 items-center gap-3 border-b-2 border-divider px-4 pt-[18px] pb-3.5">
      <button type="button" onClick={goBack} className="icon-btn" aria-label="ย้อนกลับ">
        <ChevronLeftIcon />
      </button>
      <h2 className="m-0 flex-1 text-center text-[17px] leading-tight">{title}</h2>
      <div className="flex w-9 shrink-0 justify-end">{action}</div>
    </header>
  );
}
