/**
 * The vocabulary of the bot's buttons.
 *
 * A Flex button carries an opaque string back to the webhook, and that string
 * is the only state a tap conveys — there is no form, no session and no page
 * the user was on. So every button has to name both what it does and what it
 * does it to, which is what these shapes are.
 *
 * Encoded as a query string rather than JSON: it survives LINE's 300-character
 * limit more comfortably, and reads legibly in the console's webhook log when
 * something is wrong.
 *
 * Parsing is total. Anything unrecognised — an older button pressed after a
 * deploy, a hand-crafted payload — becomes null, and the caller answers with
 * help rather than throwing.
 */

import { DECISION_REASONS, type DecisionReason } from "@/lib/domain/decisions";

export type Verdict = "approve" | "return" | "reject";

export type Postback =
  /** Requester: send the current draft for approval. */
  | { action: "submit"; documentId: string }
  /** Requester: throw the current draft away. */
  | { action: "discard"; documentId: string }
  /** Requester: drop one line that OCR got wrong beyond repair. */
  | { action: "remove"; itemId: string }
  /** Approver: an approval needs no reason, so it decides immediately. */
  | { action: "decide"; documentId: string; verdict: "approve" }
  /** Approver: a return or rejection asks for a reason first. */
  | { action: "decide"; documentId: string; verdict: "return" | "reject" }
  /** Approver: the reason chosen for that return or rejection. */
  | {
      action: "reason";
      documentId: string;
      verdict: "return" | "reject";
      reason: DecisionReason;
    }
  /** Approver: the monthly total, `offset` months from the current one. */
  | { action: "summary"; offset: number };

const VERDICTS: Verdict[] = ["approve", "return", "reject"];

function isVerdict(value: string): value is Verdict {
  return (VERDICTS as string[]).includes(value);
}

function isReason(value: string): value is DecisionReason {
  return (DECISION_REASONS as readonly string[]).includes(value);
}

/** Builds the `data` string for one button. */
export function encodePostback(postback: Postback): string {
  const params = new URLSearchParams();
  params.set("a", postback.action);

  switch (postback.action) {
    case "submit":
    case "discard":
      params.set("doc", postback.documentId);
      break;
    case "remove":
      params.set("item", postback.itemId);
      break;
    case "decide":
      params.set("doc", postback.documentId);
      params.set("v", postback.verdict);
      break;
    case "reason":
      params.set("doc", postback.documentId);
      params.set("v", postback.verdict);
      params.set("r", postback.reason);
      break;
    case "summary":
      params.set("o", String(postback.offset));
      break;
  }

  return params.toString();
}

/** Reads a `data` string back, or null if it is not one this build knows. */
export function decodePostback(data: string): Postback | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(data);
  } catch {
    return null;
  }

  const action = params.get("a");
  const documentId = params.get("doc") ?? "";
  const verdict = params.get("v") ?? "";

  switch (action) {
    case "submit":
      return documentId ? { action: "submit", documentId } : null;

    case "discard":
      return documentId ? { action: "discard", documentId } : null;

    case "remove": {
      const itemId = params.get("item") ?? "";
      return itemId ? { action: "remove", itemId } : null;
    }

    case "decide":
      if (!documentId || !isVerdict(verdict)) return null;
      return { action: "decide", documentId, verdict };

    case "reason": {
      const reason = params.get("r") ?? "";
      if (!documentId || !isVerdict(verdict) || verdict === "approve") return null;
      if (!isReason(reason)) return null;
      return { action: "reason", documentId, verdict, reason };
    }

    case "summary": {
      const offset = Number(params.get("o"));
      // Bounded because the button is generated from this value on the way
      // back out: an arbitrary offset would ask Postgres for a date range
      // thousands of years wide.
      if (!Number.isInteger(offset) || Math.abs(offset) > 120) return null;
      return { action: "summary", offset };
    }

    default:
      return null;
  }
}
