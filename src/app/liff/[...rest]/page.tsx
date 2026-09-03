import { notFound, redirect } from "next/navigation";

/**
 * Catches a path that arrived with `/liff` on the front of it more than once.
 *
 * LIFF's second redirect targets the Endpoint URL's own path with the
 * remainder of the link appended, and `liffUrl()` strips the `/liff` the
 * Endpoint already supplies so the two do not stack. That is the arrangement
 * this app is configured for — but it depends on the Endpoint URL being
 * exactly `https://<app>/liff`, which is a console setting no code can see or
 * enforce. Set it to the site root instead and every link arrives here as
 * `/liff/liff/signature`.
 *
 * Rather than answer that with a 404 nobody can act on, the duplicate prefix
 * is stripped and the request sent on to the page it plainly meant. Next
 * resolves the real routes (`/liff/signature`, `/liff/items/[id]`,
 * `/liff/documents/[id]`) before ever reaching this catch-all, so nothing that
 * already works comes through here.
 */
export const dynamic = "force-dynamic";

export default async function LiffCatchAll({
  params,
  searchParams,
}: PageProps<"/liff/[...rest]">) {
  const { rest } = await params;
  const segments = Array.isArray(rest) ? rest : [rest];

  let stripped = 0;
  while (stripped < segments.length && segments[stripped] === "liff") {
    stripped += 1;
  }

  // Nothing doubled up: this is simply a page that does not exist, and
  // redirecting to itself would loop forever.
  if (stripped === 0) notFound();

  const remainder = segments.slice(stripped);
  if (remainder.length === 0) redirect("/liff");

  // The query carries liff.state and anything else LIFF added; dropping it
  // here would lose the very thing the next page may need to read.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const single of Array.isArray(value) ? value : [value ?? ""]) {
      query.append(key, single);
    }
  }

  const suffix = query.size > 0 ? `?${query}` : "";
  redirect(`/liff/${remainder.join("/")}${suffix}`);
}
