import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PhoneFrame } from "@/components/phone-frame";

/**
 * Everything behind sign-in. `src/proxy.ts` already turns anonymous requests
 * away; this guard is what makes the session available to the tree, and covers
 * the case where the cookie survives but the account no longer does.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return <PhoneFrame>{children}</PhoneFrame>;
}
