import { describe, it, expect } from "vitest";
import "./match-request.notification";
import "./match-accepted.notification";
import "./match-refused.notification";
import "./new-message.notification";
import "./payment-success.notification";
import { hasNotification } from "@/aura/server/notifications";

describe("notification definitions", () => {
  const cases = ["match-request", "match-accepted", "match-refused", "new-message", "payment-success"];
  for (const name of cases) {
    it(name, () => expect(hasNotification(name)).toBe(true));
  }
});
