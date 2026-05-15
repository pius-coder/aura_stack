import { z } from "zod";

const countryCodeSchema = z
  .string()
  .min(1, "Sélectionnez un indicatif.")
  .max(6, "Indicatif invalide.")
  .regex(/^\+?[1-9]\d{0,4}$/, "Indicatif invalide.");

const phoneNumberSchema = z
  .string()
  .min(4, "Numéro trop court.")
  .max(32, "Numéro trop long.");

export const auraPasswordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .refine((value) => new TextEncoder().encode(value).length <= 72, "Le mot de passe est trop long pour bcrypt.");

export const authRegisterInputSchema = z.object({
  countryCode: countryCodeSchema,
  phoneNumber: phoneNumberSchema,
  password: auraPasswordSchema,
});

export const authLoginInputSchema = z.object({
  countryCode: countryCodeSchema,
  phoneNumber: phoneNumberSchema,
  password: z.string().min(1, "Saisissez votre mot de passe."),
});

export const authVerifyOtpInputSchema = z.object({
  challengeId: z.string().min(12, "Challenge invalide."),
  code: z.string().min(4, "Code invalide.").max(12, "Code invalide."),
});

export const authRequestPasswordResetInputSchema = z.object({
  countryCode: countryCodeSchema,
  phoneNumber: phoneNumberSchema,
});

export const authResetPasswordInputSchema = z.object({
  challengeId: z.string().min(12, "Challenge invalide."),
  code: z.string().min(4, "Code invalide.").max(12, "Code invalide."),
  password: auraPasswordSchema,
});

export type AuthRegisterInput = z.infer<typeof authRegisterInputSchema>;
export type AuthLoginInput = z.infer<typeof authLoginInputSchema>;
export type AuthVerifyOtpInput = z.infer<typeof authVerifyOtpInputSchema>;
export type AuthRequestPasswordResetInput = z.infer<typeof authRequestPasswordResetInputSchema>;
export type AuthResetPasswordInput = z.infer<typeof authResetPasswordInputSchema>;
