import fs from "fs";
import path from "path";

export class FileCache<T> {
  private readonly cachePath: string;

  constructor(cacheFileName: string) {
    this.cachePath = path.join(process.cwd(), "cache", cacheFileName);
  }

  load(): T | null {
    try {
      if (!fs.existsSync(this.cachePath)) {
        return null;
      }

      const data = fs.readFileSync(this.cachePath, "utf8");
      return JSON.parse(data) as T;
    } catch (error) {
      console.error("Failed to load cache:", error);
      return null;
    }
  }

  save(data: T): void {
    try {
      const cacheDir = path.dirname(this.cachePath);

      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      fs.writeFileSync(this.cachePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Failed to save cache:", error);
    }
  }
}
