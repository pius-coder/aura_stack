

import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "../db";
import { filesystemDriver } from "./filesystem";
import type { AuraStorage, AuraStorageDriver, AuraStoreArgs, AuraStoredFileResult } from "./types";
import { toPrismaJson } from "../json";

const drivers = new Map<string, AuraStorageDriver>();
drivers.set(filesystemDriver.name, filesystemDriver);

let s3DriverRegistered = false;
async function registerS3DriverIfNeeded(): Promise<void> {
  if (s3DriverRegistered) return;
  try {
    const { s3Driver } = await import("./s3");
    drivers.set(s3Driver.name, s3Driver);
  } catch {
    // S3 SDK not installed — fine.
  } finally {
    s3DriverRegistered = true;
  }
}

export function registerStorageDriver(driver: AuraStorageDriver): void {
  drivers.set(driver.name, driver);
}

export async function getStorageDriver(name?: string): Promise<AuraStorageDriver> {
  const driverName = name || process.env.AURA_STORAGE_DRIVER || "filesystem";
  if (driverName === "s3" && !s3DriverRegistered) {
    await registerS3DriverIfNeeded();
  }
  const driver = drivers.get(driverName);
  if (!driver) {
    throw new Error(`[aura] Storage driver not found: ${driverName}`);
  }
  return driver;
}

export function getStorageDriverSync(name?: string): AuraStorageDriver {
  const driverName = name || process.env.AURA_STORAGE_DRIVER || "filesystem";
  if (driverName === "s3") {
    throw new Error("[aura] S3 driver requires async initialization. Use getStorageDriver() instead.");
  }
  const driver = drivers.get(driverName);
  if (!driver) {
    throw new Error(`[aura] Storage driver not found: ${driverName}`);
  }
  return driver;
}

// ---------------------------------------------------------------------------
// `AuraStoredFile`-backed store / getUrl / delete (Decision 17, task 14.1)
// ---------------------------------------------------------------------------

const STORAGE_PATH = process.env.AURA_STORAGE_PATH || "storage/files";
const SERVING_PREFIX = process.env.AURA_FILES_PUBLIC_PREFIX || "/files";

function shortId(): string {
  return randomBytes(8).toString("hex");
}

async function bytesFromInput(args: AuraStoreArgs): Promise<{ bytes: Buffer; contentType: string; size: number }> {
  if (Buffer.isBuffer(args.data)) {
    return {
      bytes: args.data,
      contentType: args.contentType ?? "application/octet-stream",
      size: args.data.byteLength,
    };
  }
  if (typeof args.data === "string") {
    if (args.data.startsWith("data:")) {
      const match = args.data.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid data URL");
      const buf = Buffer.from(match[2], "base64");
      return {
        bytes: buf,
        contentType: args.contentType ?? match[1] ?? "application/octet-stream",
        size: buf.byteLength,
      };
    }
    const buf = Buffer.from(args.data, "utf8");
    return {
      bytes: buf,
      contentType: args.contentType ?? "text/plain",
      size: buf.byteLength,
    };
  }
  // Web File
  const file = args.data as File;
  const buf = Buffer.from(await file.arrayBuffer());
  return {
    bytes: buf,
    contentType: args.contentType ?? file.type ?? "application/octet-stream",
    size: buf.byteLength,
  };
}

function resolveStoredPath(relativePath: string): string {
  const base = join(process.cwd(), STORAGE_PATH);
  const target = join(base, relativePath);
  if (!target.startsWith(base + "/") && target !== base) {
    throw new Error("Invalid storage path: traversal detected");
  }
  return target;
}

export async function storeFile(args: AuraStoreArgs): Promise<AuraStoredFileResult> {
  const { bytes, contentType, size } = await bytesFromInput(args);
  const path = `${shortId()}/${args.filename}`;
  const target = resolveStoredPath(path);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);

  const row = await db.auraStoredFile.create({
    data: {
      filename: args.filename,
      contentType,
      size,
      path,
      driver: "filesystem",
      metadata: toPrismaJson(args.metadata),
    },
  });

  return {
    storageId: row.id,
    filename: row.filename,
    contentType: row.contentType,
    size: row.size,
  };
}

export async function getStoredFileUrl(storageId: string): Promise<string> {
  const row = await db.auraStoredFile.findUnique({ where: { id: storageId } });
  if (!row) throw new Error(`Stored file not found: ${storageId}`);
  return `${SERVING_PREFIX}/${storageId}/${encodeURIComponent(row.filename)}`;
}

export async function removeStoredFile(storageId: string): Promise<void> {
  const row = await db.auraStoredFile.findUnique({ where: { id: storageId } });
  if (!row) return;
  const target = resolveStoredPath(row.path);
  try {
    await unlink(target);
  } catch {
    /* already gone */
  }
  await db.auraStoredFile.delete({ where: { id: storageId } });
}

export function createAuraStorage(): AuraStorage {
  const driver = getStorageDriverSync();

  return {
    async upload(args) {
      return driver.upload(args);
    },
    async delete(keyOrUrl) {
      return driver.delete(keyOrUrl);
    },
    async store(args) {
      return storeFile(args);
    },
    async getUrl(storageId) {
      return getStoredFileUrl(storageId);
    },
    async removeStoredFile(storageId) {
      return removeStoredFile(storageId);
    },
  };
}

export async function createAuraStorageAsync(): Promise<AuraStorage> {
  const driver = await getStorageDriver();

  return {
    async upload(args) {
      return driver.upload(args);
    },
    async delete(keyOrUrl) {
      return driver.delete(keyOrUrl);
    },
    async store(args) {
      return storeFile(args);
    },
    async getUrl(storageId) {
      return getStoredFileUrl(storageId);
    },
    async removeStoredFile(storageId) {
      return removeStoredFile(storageId);
    },
  };
}
