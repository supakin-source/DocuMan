import "dotenv/config";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { downloadFile, ensureRootFolder, trashFile, uploadFile } from "@/lib/google/drive";

/**
 * Exercises the two integrations that unit tests cannot cover, against real
 * Google credentials:
 *
 *   pnpm verify:google someone@assetfive.co.th
 *
 * Everything else in this project is covered by `pnpm test`. Drive and Gemini
 * are not: they need a real OAuth grant and a real API key, so until this script
 * passes they are unproven, however well they typecheck.
 *
 * The Drive half runs as a named user, because that is how the app works — files
 * live in the claimant's own Drive, reached with their stored refresh token. So
 * that person must have signed in through the app at least once.
 */

type Check = { name: string; ok: boolean; detail: string };

const results: Check[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}\n        ${detail}`);
}

async function checkEnvironment(): Promise<boolean> {
  try {
    const env = serverEnv();
    record(
      "environment",
      true,
      `model=${env.GEMINI_MODEL}, drive folder=${env.GOOGLE_DRIVE_ROOT_FOLDER_NAME}`,
    );
    return true;
  } catch (error) {
    record("environment", false, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Confirms the API key, the model id and the structured-output path all work.
 *
 * Deliberately a text prompt rather than an image: this is checking that we can
 * reach the model and that it honours a JSON schema. How well it reads a
 * crumpled Thai taxi receipt is a question only real receipts can answer, and
 * the review screen exists because the answer is never "perfectly".
 */
async function checkGemini() {
  const env = serverEnv();
  const ai = new GoogleGenAI({ apiKey: env.GOOGLE_GENAI_API_KEY });

  const schema = z.object({
    total: z.number().describe("The total amount in baht"),
    date: z.iso.date().describe("The date as YYYY-MM-DD"),
  });

  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "ใบเสร็จค่าแท็กซี่ ลงวันที่ 28 กรกฎาคม 2569 จำนวนเงิน 245 บาท " +
                "Extract the total and the date. The year is in the Buddhist Era.",
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(schema, { io: "output" }),
      },
    });

    const raw = response.text;
    if (!raw) {
      record("gemini: structured output", false, "empty response");
      return;
    }

    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      record("gemini: structured output", false, `schema mismatch: ${raw}`);
      return;
    }

    // 2569 BE is 2026 CE. Getting this wrong in production would date every
    // claim 543 years out, so it is worth asserting here.
    const convertedEra = parsed.data.date.startsWith("2026");
    record(
      "gemini: structured output",
      convertedEra && parsed.data.total === 245,
      `read total=${parsed.data.total}, date=${parsed.data.date}` +
        (convertedEra ? "" : " — Buddhist Era was NOT converted"),
    );
  } catch (error) {
    record(
      "gemini: structured output",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * A full Drive round-trip as `userId`: create the folder, upload, read back,
 * then clean up. Uses the app's own helpers, so a pass here means the app's
 * path works, not merely that Drive is reachable.
 */
async function checkDrive(userId: string, email: string) {
  let folderId: string | null = null;
  try {
    folderId = await ensureRootFolder(userId);
    record("drive: folder", true, `root folder for ${email} is ${folderId}`);
  } catch (error) {
    record("drive: folder", false, error instanceof Error ? error.message : String(error));
    return;
  }

  const payload = Buffer.from(`DocuMan verification ${new Date().toISOString()}`);
  let fileId: string | null = null;

  try {
    const stored = await uploadFile(userId, {
      name: "documan-verification.txt",
      mimeType: "text/plain",
      body: payload,
    });
    fileId = stored.id;
    record("drive: upload", true, `uploaded ${stored.name} (${stored.id})`);
  } catch (error) {
    record("drive: upload", false, error instanceof Error ? error.message : String(error));
    return;
  }

  try {
    const back = await downloadFile(userId, fileId);
    const identical = back.equals(payload);
    record(
      "drive: download",
      identical,
      identical ? `${back.byteLength} bytes match` : "bytes differ from what was uploaded",
    );
  } catch (error) {
    record("drive: download", false, error instanceof Error ? error.message : String(error));
  }

  try {
    await trashFile(userId, fileId);
    record("drive: cleanup", true, "verification file moved to trash");
  } catch (error) {
    record(
      "drive: cleanup",
      false,
      `left behind ${fileId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: pnpm verify:google <email>");
    console.error("The account must have signed in through the app at least once.");
    process.exitCode = 1;
    return;
  }

  console.log(`Verifying Google integrations as ${email}\n`);

  if (!(await checkEnvironment())) {
    process.exitCode = 1;
    return;
  }

  await checkGemini();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      accounts: { where: { provider: "google" }, select: { refresh_token: true, scope: true } },
    },
  });

  if (!user) {
    record("drive: account", false, `no account for ${email} — sign in through the app first`);
  } else if (!user.accounts[0]?.refresh_token) {
    // Google issues a refresh token only on the first consent. An account that
    // signed in before access_type=offline was set will not have one.
    record(
      "drive: account",
      false,
      "no refresh token stored — revoke the app at myaccount.google.com/permissions and sign in again",
    );
  } else {
    record("drive: account", true, `scopes: ${user.accounts[0].scope ?? "unknown"}`);
    await checkDrive(user.id, email);
  }

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed` +
      (failed.length ? `\nFailed: ${failed.map((f) => f.name).join(", ")}` : ""),
  );

  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
