import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { v7 as uuidv7 } from "uuid";
import type { ImageStorage } from "./imageStorage.js";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  /** The bucket's public base URL (a custom domain or the r2.dev public URL) - R2 doesn't return one from the upload call itself, unlike Cloudinary. */
  publicBaseUrl: string;
}

/**
 * Cloudflare R2 is S3-compatible, so this uses the standard AWS S3 SDK
 * pointed at R2's endpoint rather than a Cloudflare-specific client.
 */
export class R2ImageStorage implements ImageStorage {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;

  constructor(config: R2Config) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // The AWS SDK v3 sends flexible-checksum headers by default, which R2
      // rejects with a 400 InvalidArgument - R2 isn't fully S3-compatible here.
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
    this.bucketName = config.bucketName;
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/$/, "");
  }

  async upload(buffer: Buffer, folder: string, extension: string): Promise<{ url: string }> {
    const key = `fashion-platform/${folder}/${uuidv7()}.${extension}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: `image/${extension}`,
      }),
    );
    return { url: `${this.publicBaseUrl}/${key}` };
  }
}
