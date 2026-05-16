import { describe, it, expect } from "vitest";
import { hasNotification } from "@/aura/server/notifications";

// Side-effect imports to register notification definitions
import "./match-request.notification";
import "./match-accepted.notification";
import "./match-refused.notification";

describe("notification definitions", () => {
  const expected = [
    { name: "match-request", file: "match-request.notification.ts" },
    { name: "match-accepted", file: "match-accepted.notification.ts" },
    { name: "match-refused", file: "match-refused.notification.ts" },
  ];

  for (const { name, file } of expected) {
    it(`"${name}" is registered (from ${file})`, () => {
      expect(hasNotification(name)).toBe(true);
    });
  }
});
