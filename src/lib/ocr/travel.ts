import { z } from "zod";

import { ExpenseItemType } from "@/generated/prisma/enums";
import { DEFAULT_RATE_PER_KM } from "@/lib/domain/items";
import { extractStructured, type OcrInput } from "@/lib/ocr/gemini";

/**
 * What Gemini is asked to find in one uploaded receipt, map screenshot or toll
 * slip. Every field is nullable: the model is told to leave anything the
 * document does not state as null rather than guess, and the reviewer fills the
 * gaps on the confirmation screen.
 */
const extractionSchema = z.object({
  kind: z
    .enum(["personal_vehicle", "public_transport", "toll", "unknown"])
    .describe(
      "personal_vehicle for a route/map screenshot showing a driving distance, " +
        "public_transport for a bus, train, taxi or ride-hailing receipt, " +
        "toll for an expressway or parking slip, unknown if unclear",
    ),
  date: z.iso
    .date()
    .nullable()
    .describe("Date on the document as YYYY-MM-DD, Gregorian. Convert from พ.ศ. if needed."),
  origin: z.string().nullable().describe("Starting place, in the document's own words"),
  destination: z.string().nullable().describe("Ending place, in the document's own words"),
  distanceKm: z
    .number()
    .nullable()
    .describe("Driving distance in kilometres, digits only, when the document shows one"),
  amount: z
    .number()
    .nullable()
    .describe("Total paid in THB. Null for a map screenshot, which shows no price."),
});

export type TravelExtraction = z.infer<typeof extractionSchema>;

const KIND_TO_ITEM_TYPE: Record<
  Exclude<TravelExtraction["kind"], "unknown">,
  ExpenseItemType
> = {
  personal_vehicle: ExpenseItemType.PERSONAL_VEHICLE,
  public_transport: ExpenseItemType.PUBLIC_TRANSPORT,
  toll: ExpenseItemType.TOLL,
};

const INSTRUCTIONS = [
  "You are reading one supporting document for a Thai travel expense claim.",
  "It is a receipt, a ticket, an expressway or parking slip, or a screenshot of a map route.",
  "Identify which of those it is and pull out the fields described by the schema.",
  "Thai dates are often in the Buddhist Era (พ.ศ.); subtract 543 to get the Gregorian year.",
  "Report distance in kilometres and money in baht as plain numbers, without units or separators.",
].join(" ");

/**
 * Reads one uploaded file and returns a draft expense line for the reviewer to
 * confirm. Never authoritative: the confirmation screen exists precisely
 * because OCR is a suggestion.
 */
export async function extractTravelItem(input: OcrInput): Promise<{
  type: ExpenseItemType;
  incurredOn: string | null;
  origin: string | null;
  destination: string | null;
  distanceKm: number | null;
  ratePerKm: number | null;
  amount: number | null;
  /** True when the model could not tell what the document was. */
  uncertain: boolean;
}> {
  const result = await extractStructured(input, extractionSchema, INSTRUCTIONS);

  // An unrecognised document still becomes a line — blank, for the user to fill
  // in — rather than being dropped silently after they uploaded it.
  const type =
    result.kind === "unknown"
      ? ExpenseItemType.PUBLIC_TRANSPORT
      : KIND_TO_ITEM_TYPE[result.kind];
  const uncertain = result.kind === "unknown";

  const isMileage = type === ExpenseItemType.PERSONAL_VEHICLE;

  return {
    type,
    incurredOn: result.date,
    origin: result.origin,
    destination: result.destination,
    distanceKm: isMileage ? result.distanceKm : null,
    // The company rate is policy, not something printed on a map screenshot.
    ratePerKm: isMileage ? DEFAULT_RATE_PER_KM : null,
    // A mileage line's amount is always derived from distance × rate, so any
    // figure the model read off the page is discarded here.
    amount: isMileage ? null : result.amount,
    uncertain,
  };
}
