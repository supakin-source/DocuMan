"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Boots LIFF and holds the ID token every request on these pages carries.
 *
 * The SDK is loaded from LINE's CDN rather than installed. It is a browser-only
 * script that has to match whatever LINE currently serves inside their app, and
 * `src/lib/line/client.ts` already declines the server-side SDK for a similar
 * reason: neither is a dependency worth pinning for the little of it in use.
 */

const SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

/** The slice of the SDK these pages touch. */
type Liff = {
  init: (config: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: (config?: { redirectUri?: string }) => void;
  getIDToken: () => string | null;
  isInClient: () => boolean;
  closeWindow: () => void;
};

declare global {
  interface Window {
    liff?: Liff;
  }
}

export type LiffState =
  | { status: "loading" }
  /** Running outside LINE with no way to sign in, or the SDK never arrived. */
  | { status: "unavailable"; reason: string }
  | { status: "ready"; idToken: string; inClient: boolean };

const LiffContext = createContext<LiffState>({ status: "loading" });

export function useLiff(): LiffState {
  return useContext(LiffContext);
}

/**
 * Calls an API route as the person LINE says is looking at the page.
 *
 * Every LIFF route authenticates from this header and nothing else — no cookie,
 * no session — so a page that forgets it gets a 401 rather than someone else's
 * data.
 */
export async function liffFetch(
  idToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${idToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

function loadSdk(): Promise<Liff> {
  if (window.liff) return Promise.resolve(window.liff);

  return new Promise((resolve, reject) => {
    // Reuse the tag if a previous mount already added it, so a remount does not
    // fetch the SDK twice.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_URL}"]`,
    );
    const script = existing ?? document.createElement("script");

    script.addEventListener("load", () => {
      if (window.liff) resolve(window.liff);
      else reject(new Error("LIFF SDK loaded without defining liff"));
    });
    script.addEventListener("error", () => reject(new Error("Could not load the LIFF SDK")));

    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      document.head.append(script);
    }
  });
}

export function LiffProvider({
  liffId,
  children,
}: {
  /** Empty when LINE_LIFF_ID is unset, which is a configuration problem the
   * page should say out loud rather than fail mysteriously on. */
  liffId: string;
  children: ReactNode;
}) {
  // A missing LIFF id is a deployment that was never finished configuring, not
  // something to discover asynchronously — so it is the initial state rather
  // than the first thing the effect below does.
  const [state, setState] = useState<LiffState>(() =>
    liffId
      ? { status: "loading" }
      : { status: "unavailable", reason: "ยังไม่ได้ตั้งค่า LIFF กรุณาติดต่อผู้ดูแลระบบ" },
  );

  useEffect(() => {
    if (!liffId) return;

    let cancelled = false;

    async function boot() {
      try {
        const liff = await loadSdk();
        await liff.init({ liffId });
        if (cancelled) return;

        if (!liff.isLoggedIn()) {
          // Sends the browser to LINE and back to this exact URL. Nothing after
          // this line runs.
          liff.login({ redirectUri: window.location.href });
          return;
        }

        const idToken = liff.getIDToken();
        if (!idToken) {
          // Happens when the LIFF app is not granted the openid scope; without a
          // token there is no way to say who is looking, and guessing is exactly
          // what this page must not do.
          setState({
            status: "unavailable",
            reason: "ไม่ได้รับสิทธิ์ระบุตัวตนจากไลน์ กรุณาติดต่อผู้ดูแลระบบ",
          });
          return;
        }

        setState({ status: "ready", idToken, inClient: liff.isInClient() });
      } catch (error) {
        if (cancelled) return;
        console.error("LIFF failed to start", error);
        setState({
          status: "unavailable",
          reason: "เปิดหน้านี้จากแอปไลน์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
        });
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return <LiffContext value={state}>{children}</LiffContext>;
}

/** Closes the LIFF window when there is one, so the user lands back in the chat. */
export function closeLiff(): void {
  try {
    if (window.liff?.isInClient()) window.liff.closeWindow();
  } catch {
    // Outside LINE there is no window to close, which is not a failure.
  }
}
