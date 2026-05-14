import "server-only";

import { filesystemDriver } from "./filesystem";
import { s3Driver } from "./s3";
import type { AuraStorage, AuraStorageDriver } from "./types";

const drivers = new Map<string, AuraStorageDriver>();

drivers.set(filesystemDriver.name, filesystemDriver);
drivers.set(s3Driver.name, s3Driver);

export function registerStorageDriver(driver: AuraStorageDriver): void {
  drivers.set(driver.name, driver);
}

export function getStorageDriver(name?: string): AuraStorageDriver {
  const driverName = name || process.env.AURA_STORAGE_DRIVER || "filesystem";
  const driver = drivers.get(driverName);
  if (!driver) {
    throw new Error(`[aura] Storage driver not found: ${driverName}`);
  }
  return driver;
}

export function createAuraStorage(): AuraStorage {
  const driver = getStorageDriver();

  return {
    async upload(args) {
      return driver.upload(args);
    },
    async delete(keyOrUrl) {
      return driver.delete(keyOrUrl);
    },
  };
}
