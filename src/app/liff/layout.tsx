import { LiffProvider } from "@/app/liff/liff-provider";

/**
 * The pages the bot links to, opened inside LINE.
 *
 * Deliberately not the `(app)` layout: there is no sign-in here and no phone
 * frame either — LINE already supplies the chrome, and drawing a phone inside a
 * phone would be absurd. Every page below is a client component, because the
 * only thing that knows who is looking is the LIFF SDK, and it runs in the
 * browser.
 */
/**
 * Rendered per request, not prerendered.
 *
 * `LINE_LIFF_ID` is read here, and a statically prerendered page would freeze
 * whatever it was at build time — which on a fresh checkout is nothing, leaving
 * a page that quietly reports LIFF as unconfigured however the host is set up.
 */
export const dynamic = "force-dynamic";

export default function LiffLayout({ children }: LayoutProps<"/liff">) {
  return (
    <LiffProvider liffId={process.env.LINE_LIFF_ID ?? ""}>
      <div className="mx-auto min-h-dvh w-full max-w-md bg-bg px-4 py-5 text-text">
        {children}
      </div>
    </LiffProvider>
  );
}
