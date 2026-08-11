import type { ReactNode } from "react";

/**
 * The 390×844 device frame the design is drawn in.
 *
 * On a phone the app fills the screen — the frame is a desktop affordance only,
 * so it appears from `sm` up rather than boxing a real handset inside a border.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh sm:flex sm:flex-col sm:items-center sm:gap-[18px] sm:px-4 sm:pt-7 sm:pb-15">
      <div
        className="
          flex h-dvh w-full flex-col overflow-hidden bg-white
          sm:h-[844px] sm:max-w-[390px] sm:border-2 sm:border-divider sm:elev-lg
        "
      >
        {children}
      </div>
    </div>
  );
}
