import fs from "fs";
import path from "path";

import { logger } from "./log";

export class FileCache {
  private filePath: string;

  constructor(fileName: string) {
    this.filePath = path.join(process.cwd(), "state", fileName);
    this.ensureStateDir();
  }

  private ensureStateDir(): void {
    const stateDir = path.dirname(this.filePath);

    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
  }

  load<T>(): T | null {
    try {
      if (!fs.existsSync(this.filePath)) {
        return null;
      }
      const data = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      logger.warn(`Failed to load cache from ${this.filePath}:`, error);
      return null;
    }
  }

  save<T>(data: T): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error(`Failed to save cache to ${this.filePath}:`, error);
    }
  }

  clear(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch (error) {
      logger.error(`Failed to clear cache at ${this.filePath}:`, error);
    }
  }
}
