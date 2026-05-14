import { z } from "zod";

export const authPhoneOtpNotificationSchema = z.object({
  phoneE164: z.string().min(6),
  code: z.string().min(4).max(12),
  purpose: z.enum(["register_phone", "login_phone", "reset_password", "change_phone", "sensitive_action"]),
  expiresAt: z.string().datetime(),
});

export type AuthPhoneOtpNotificationPayload = z.infer<typeof authPhoneOtpNotificationSchema>;
