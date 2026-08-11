import { Readable } from "node:stream";

import { google, type drive_v3 } from "googleapis";

import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { googleClientForUser } from "@/lib/google/oauth";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

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

async function driveForUser(userId: string): Promise<drive_v3.Drive> {
  const auth = await googleClientForUser(userId);
  return google.drive({ version: "v3", auth });
}

/**
 * Returns the id of this user's DocuMan folder, creating it on first use.
 *
 * The id is cached on the User row: `drive.file` scope means we can only see
 * folders DocuMan created, so a lookup by name would fail to find a folder the
 * user has since renamed.
 */
export async function ensureRootFolder(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { driveRootFolderId: true },
  });

  if (user.driveRootFolderId) {
    // Verify it still exists — the user may have deleted it from Drive directly.
    const drive = await driveForUser(userId);
    try {
      await drive.files.get({
        fileId: user.driveRootFolderId,
        fields: "id, trashed",
      });
      return user.driveRootFolderId;
    } catch {
      // Fall through and create a replacement.
    }
  }

  const drive = await driveForUser(userId);
  const created = await drive.files.create({
    requestBody: {
      name: serverEnv().GOOGLE_DRIVE_ROOT_FOLDER_NAME,
      mimeType: FOLDER_MIME_TYPE,
    },
    fields: "id",
  });

  const folderId = created.data.id;
  if (!folderId) {
    throw new Error("Drive did not return an id for the created folder");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { driveRootFolderId: folderId },
  });

  return folderId;
}

/**
 * Uploads a file into the user's DocuMan folder and returns its Drive metadata.
 */
export async function uploadFile(
  userId: string,
  file: { name: string; mimeType: string; body: Buffer | Readable },
): Promise<StoredFile> {
  const [drive, parentId] = await Promise.all([
    driveForUser(userId),
    ensureRootFolder(userId),
  ]);

  const response = await drive.files.create({
    requestBody: {
      name: file.name,
      parents: [parentId],
    },
    media: {
      mimeType: file.mimeType,
      body: Buffer.isBuffer(file.body) ? Readable.from(file.body) : file.body,
    },
    fields: "id, name, mimeType, size, webViewLink",
  });

  return toStoredFile(response.data);
}

/**
 * Downloads a file's bytes. Used to feed OCR and to stream documents back to the
 * browser without exposing the user's Drive token.
 */
export async function downloadFile(
  userId: string,
  fileId: string,
): Promise<Buffer> {
  const drive = await driveForUser(userId);
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );

  return Buffer.from(response.data as ArrayBuffer);
}

export async function getFileMetadata(
  userId: string,
  fileId: string,
): Promise<StoredFile> {
  const drive = await driveForUser(userId);
  const response = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, size, webViewLink",
  });

  return toStoredFile(response.data);
}

/**
 * Moves a file to the Drive trash. Trashing rather than hard-deleting leaves the
 * user a recovery window, which matters for documents of record.
 */
export async function trashFile(userId: string, fileId: string): Promise<void> {
  const drive = await driveForUser(userId);
  await drive.files.update({ fileId, requestBody: { trashed: true } });
}

function toStoredFile(data: drive_v3.Schema$File): StoredFile {
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
