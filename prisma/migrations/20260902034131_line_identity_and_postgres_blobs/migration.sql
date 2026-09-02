-- DropIndex
DROP INDEX "Attachment_driveFileId_key";

-- AlterTable
ALTER TABLE "Attachment" DROP COLUMN "driveFileId";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lineUserId" TEXT;

-- CreateTable
CREATE TABLE "AttachmentBlob" (
    "attachmentId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "AttachmentBlob_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateTable
CREATE TABLE "DocumentPdf" (
    "documentId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPdf_pkey" PRIMARY KEY ("documentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_lineUserId_key" ON "User"("lineUserId");

-- AddForeignKey
ALTER TABLE "AttachmentBlob" ADD CONSTRAINT "AttachmentBlob_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPdf" ADD CONSTRAINT "DocumentPdf_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ExpenseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

