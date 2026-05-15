

import type { AuraLogger } from "./context";

function write(level: string, requestId: string, message: string, metadata?: Record<string, unknown>) {
  const payload = {
    level,
    requestId,
    message,
    metadata,
    time: new Date().toISOString(),
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

export function createAuraLogger(requestId: string): AuraLogger {
  return {
    debug(message, metadata) {
      if (process.env.NODE_ENV !== "production") write("debug", requestId, message, metadata);
    },
    info(message, metadata) {
      write("info", requestId, message, metadata);
    },
    warn(message, metadata) {
      write("warn", requestId, message, metadata);
    },
    error(message, metadata) {
      write("error", requestId, message, metadata);
    },
  };
}
