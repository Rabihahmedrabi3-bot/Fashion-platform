import { fileTypeFromBuffer } from "file-type";
import multer from "multer";
import { UnprocessableEntityError } from "./errors.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// SVG is deliberately excluded even though it's a valid "image" mimetype - it can embed
// <script> and would be a stored-XSS vector once served back from the same origin.
export const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Shared across every image-upload route (product photo, store logo, theme hero image). */
export const imageUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
});

/** Never trust the client's declared Content-Type - sniff the real magic bytes. */
export async function validateImageBuffer(buffer: Buffer): Promise<{ ext: string; mime: string }> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_IMAGE_MIME_TYPES.has(detected.mime)) {
    throw new UnprocessableEntityError("file must be a JPEG, PNG, WEBP, or GIF image");
  }
  return detected;
}
