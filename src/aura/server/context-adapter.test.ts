import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AuraCookieMutation } from "@/aura/core/types";

// Mock the @tanstack/start-server-core module
vi.mock("@tanstack/start-server-core", () => ({
  getRequestHeaders: vi.fn(),
  getRequest: vi.fn(),
  getRequestIP: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

import {
  getRequestHeaders,
  getRequest,
  getRequestIP,
  setCookie,
  deleteCookie,
} from "@tanstack/start-server-core";

import {
  getAuraRequestHeaders,
  getAuraRequest,
  getAuraRequestIP,
  applyAuraCookies,
  createAuraRequest,
  getAuraRequestMetadata,
} from "./context-adapter";

describe("context-adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getAuraRequestHeaders", () => {
    it("should convert TypedHeaders to Headers object", () => {
      vi.mocked(getRequestHeaders).mockReturnValue({
        "content-type": "application/json",
        "user-agent": "test-agent",
        "x-forwarded-for": "192.168.1.1",
      } as never);

      const headers = getAuraRequestHeaders();

      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("user-agent")).toBe("test-agent");
      expect(headers.get("x-forwarded-for")).toBe("192.168.1.1");
    });

    it("should handle arrays for headers with multiple values", () => {
      vi.mocked(getRequestHeaders).mockReturnValue({
        "set-cookie": ["cookie1=value1", "cookie2=value2"],
      } as never);

      const headers = getAuraRequestHeaders();

      // When using append, getAll doesn't exist on Headers, so we check the first
      expect(headers.get("set-cookie")).toBe("cookie1=value1, cookie2=value2");
    });

    it("should handle empty headers", () => {
      vi.mocked(getRequestHeaders).mockReturnValue({} as never);

      const headers = getAuraRequestHeaders();

      expect(headers).toBeInstanceOf(Headers);
    });
  });

  describe("getAuraRequest", () => {
    it("should return the current request from context", () => {
      const mockRequest = new Request("http://test.local/path");
      vi.mocked(getRequest).mockReturnValue(mockRequest);

      const result = getAuraRequest();

      expect(result).toBe(mockRequest);
    });
  });

  describe("getAuraRequestIP", () => {
    it("should return IP address from context", () => {
      vi.mocked(getRequestIP).mockReturnValue("192.168.1.1");

      const ip = getAuraRequestIP({ xForwardedFor: true });

      expect(ip).toBe("192.168.1.1");
      expect(getRequestIP).toHaveBeenCalledWith({ xForwardedFor: true });
    });

    it("should return undefined when IP is not available", () => {
      vi.mocked(getRequestIP).mockReturnValue(undefined);

      const ip = getAuraRequestIP();

      expect(ip).toBeUndefined();
    });
  });

  describe("applyAuraCookies", () => {
    it("should call setCookie for regular cookie mutations", () => {
      const mutations: AuraCookieMutation[] = [
        {
          name: "session",
          value: "token123",
          options: {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
          },
        },
      ];

      applyAuraCookies(mutations);

      expect(setCookie).toHaveBeenCalledWith("session", "token123", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: undefined,
        expires: undefined,
      });
    });

    it("should call deleteCookie for maxAge: 0 (cookie deletion)", () => {
      const mutations: AuraCookieMutation[] = [
        {
          name: "session",
          value: "",
          options: {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: 0,
          },
        },
      ];

      applyAuraCookies(mutations);

      expect(deleteCookie).toHaveBeenCalledWith("session", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: undefined,
      });
    });

    it("should handle multiple cookie mutations", () => {
      const mutations: AuraCookieMutation[] = [
        {
          name: "session",
          value: "token123",
          options: { path: "/", httpOnly: true },
        },
        {
          name: "old_session",
          value: "",
          options: { path: "/", maxAge: 0 },
        },
      ];

      applyAuraCookies(mutations);

      expect(setCookie).toHaveBeenCalledTimes(1);
      expect(deleteCookie).toHaveBeenCalledTimes(1);
    });

    it("should preserve expires date in options", () => {
      const expiresAt = new Date("2025-12-31T23:59:59Z");
      const mutations: AuraCookieMutation[] = [
        {
          name: "session",
          value: "token123",
          options: {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            expires: expiresAt,
          },
        },
      ];

      applyAuraCookies(mutations);

      expect(setCookie).toHaveBeenCalledWith("session", "token123", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: undefined,
        expires: expiresAt,
      });
    });
  });

  describe("createAuraRequest", () => {
    it("should create a Request with headers from context", () => {
      vi.mocked(getRequestHeaders).mockReturnValue({
        "user-agent": "test-agent",
        cookie: "session=abc123",
      } as never);

      const request = createAuraRequest();

      expect(request).toBeInstanceOf(Request);
      expect(request.headers.get("user-agent")).toBe("test-agent");
      expect(request.headers.get("cookie")).toBe("session=abc123");
      expect(request.url).toBe("aura://internal");
    });

    it("should merge additional headers with context headers", () => {
      vi.mocked(getRequestHeaders).mockReturnValue({
        "user-agent": "test-agent",
      } as never);

      const request = createAuraRequest({
        "x-custom-header": "custom-value",
        authorization: "Bearer token",
      });

      expect(request.headers.get("user-agent")).toBe("test-agent");
      expect(request.headers.get("x-custom-header")).toBe("custom-value");
      expect(request.headers.get("authorization")).toBe("Bearer token");
    });

    it("should allow overriding context headers with additional headers", () => {
      vi.mocked(getRequestHeaders).mockReturnValue({
        "x-custom-header": "original-value",
      } as never);

      const request = createAuraRequest({
        "x-custom-header": "overridden-value",
      });

      expect(request.headers.get("x-custom-header")).toBe("overridden-value");
    });
  });

  describe("getAuraRequestMetadata", () => {
    it("should extract all metadata from request context", () => {
      vi.mocked(getRequestHeaders).mockReturnValue({
        "user-agent": "Mozilla/5.0",
        origin: "http://localhost:3000",
        "cf-ipcountry": "FR",
      } as never);
      vi.mocked(getRequestIP).mockReturnValue("192.168.1.1");

      const metadata = getAuraRequestMetadata();

      expect(metadata).toEqual({
        ip: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        origin: "http://localhost:3000",
        countryCode: "FR",
      });
    });

    it("should return undefined for missing optional fields", () => {
      vi.mocked(getRequestHeaders).mockReturnValue({} as never);
      vi.mocked(getRequestIP).mockReturnValue(undefined);

      const metadata = getAuraRequestMetadata();

      expect(metadata).toEqual({
        ip: undefined,
        userAgent: undefined,
        origin: undefined,
        countryCode: undefined,
      });
    });
  });
});
