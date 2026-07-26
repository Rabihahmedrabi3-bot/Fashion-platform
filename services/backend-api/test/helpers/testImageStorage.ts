import { v7 as uuidv7 } from "uuid";
import type { ImageStorage } from "../../src/lib/imageStorage.js";

export class TestImageStorage implements ImageStorage {
  uploaded: Array<{ folder: string; extension: string }> = [];

  async upload(_buffer: Buffer, folder: string, extension: string): Promise<{ url: string }> {
    this.uploaded.push({ folder, extension });
    return { url: `https://test-image-storage.local/${folder}/${uuidv7()}.${extension}` };
  }
}
