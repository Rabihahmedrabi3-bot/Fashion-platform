/**
 * Swappable transport for uploaded image bytes, mirroring EmailProvider
 * (lib/email.ts). Render's free-tier filesystem is ephemeral - anything
 * written to local disk is lost on the next redeploy or restart - so the
 * real implementation must be durable external storage, not a local-disk
 * stub like DevConsoleEmailProvider is for email.
 */
export interface ImageStorage {
  upload(buffer: Buffer, folder: string, extension: string): Promise<{ url: string }>;
}
