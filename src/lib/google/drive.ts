import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { googleFetch } from "@/lib/google/token";

export { GoogleApiError, GoogleReauthRequiredError } from "@/lib/google/token";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/** Fields requested for any file we hand back to the app. */
const FILE_FIELDS = "id, name, mimeType, size, webViewLink";

export type StoredFile = {
  /** Drive file id — this is the storage key persisted alongside a document. */
  id: string;
  name: string;
  mimeType: string;
  /** Size in bytes, when Drive reports it. */
  size?: number;
  /** Drive's own viewer URL, useful for "open in Drive" links. */
  webViewLink?: string;
};

type DriveFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
};

/**
 * Drive access over plain `fetch`.
 *
 * The googleapis SDK is not used here: it pulls in google-auth-library, which
 * requires `child_process`, `fs` and `os` — none of which exist on the Workers
 * runtime this deploys to. The REST surface we need is four calls wide, so
 * calling it directly costs less than making the SDK portable would.
 */
export async function ensureRootFolder(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { driveRootFolderId: true },
  });

  if (user.driveRootFolderId) {
    // Verify it still exists — the user may have deleted it from Drive directly.
    try {
      await googleFetch(
        userId,
        `${DRIVE_API}/${user.driveRootFolderId}?fields=id,trashed`,
      );
      return user.driveRootFolderId;
    } catch {
      // Fall through and create a replacement.
    }
  }

  const response = await googleFetch(userId, `${DRIVE_API}?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: serverEnv().GOOGLE_DRIVE_ROOT_FOLDER_NAME,
      mimeType: FOLDER_MIME_TYPE,
    }),
  });

  const created = (await response.json()) as DriveFile;
  if (!created.id) {
    throw new Error("Drive did not return an id for the created folder");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { driveRootFolderId: created.id },
  });

  return created.id;
}

/**
 * Builds a `multipart/related` body: a JSON metadata part, then the bytes.
 *
 * Assembled by hand because the parts have different content types and Drive
 * requires this exact shape — `FormData` would send `multipart/form-data`,
 * which the upload endpoint rejects.
 */
function multipartBody(
  metadata: Record<string, unknown>,
  mimeType: string,
  bytes: Uint8Array,
): { boundary: string; body: Uint8Array<ArrayBuffer> } {
  // Random enough that it cannot appear inside the payload by accident.
  const boundary = `documan-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();

  const head = encoder.encode(
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  return { boundary, body };
}

/**
 * Uploads a file into the user's DocuMan folder and returns its Drive metadata.
 */
export async function uploadFile(
  userId: string,
  file: { name: string; mimeType: string; body: Uint8Array },
): Promise<StoredFile> {
  const parentId = await ensureRootFolder(userId);

  const { boundary, body } = multipartBody(
    { name: file.name, parents: [parentId] },
    file.mimeType,
    file.body,
  );

  const response = await googleFetch(
    userId,
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );

  return toStoredFile((await response.json()) as DriveFile);
}

/**
 * Downloads a file's bytes. Used to feed OCR and to stream documents back to the
 * browser without exposing the user's Drive token.
 */
export async function downloadFile(
  userId: string,
  fileId: string,
): Promise<Uint8Array> {
  const response = await googleFetch(userId, `${DRIVE_API}/${fileId}?alt=media`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function getFileMetadata(
  userId: string,
  fileId: string,
): Promise<StoredFile> {
  const response = await googleFetch(
    userId,
    `${DRIVE_API}/${fileId}?fields=${encodeURIComponent(FILE_FIELDS)}`,
  );
  return toStoredFile((await response.json()) as DriveFile);
}

/**
 * Moves a file to the Drive trash. Trashing rather than hard-deleting leaves the
 * user a recovery window, which matters for documents of record.
 */
export async function trashFile(userId: string, fileId: string): Promise<void> {
  await googleFetch(userId, `${DRIVE_API}/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

function toStoredFile(data: DriveFile): StoredFile {
  if (!data.id) {
    throw new Error("Drive response is missing a file id");
  }

  return {
    id: data.id,
    name: data.name ?? "untitled",
    mimeType: data.mimeType ?? "application/octet-stream",
    size: data.size ? Number(data.size) : undefined,
    webViewLink: data.webViewLink ?? undefined,
  };
}
