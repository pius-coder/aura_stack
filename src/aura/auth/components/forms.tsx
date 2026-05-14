"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { z } from "zod";
import { useAuraForm, useAuraMutation, useAuraQuery } from "@/aura/client";
import {
  authLoginInputSchema,
  authRegisterInputSchema,
  authRequestPasswordResetInputSchema,
  authResetPasswordInputSchema,
  authVerifyOtpInputSchema,
  type AuthLoginInput,
  type AuthRegisterInput,
  type AuthRequestPasswordResetInput,
  type AuthResetPasswordInput,
  type AuthVerifyOtpInput,
} from "@/aura/shared/auth-schemas";
import type {
  AuthChallengeResult,
  AuthSessionResult,
} from "@/aura/shared/auth-types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import { CountryPhoneSelect } from "./country-phone-select";

const registerSchema = authRegisterInputSchema as z.ZodType<
  AuthRegisterInput,
  AuthRegisterInput
>;
const loginSchema = authLoginInputSchema as z.ZodType<
  AuthLoginInput,
  AuthLoginInput
>;
const verifyOtpSchema = authVerifyOtpInputSchema as z.ZodType<
  AuthVerifyOtpInput,
  AuthVerifyOtpInput
>;
const requestPasswordResetSchema =
  authRequestPasswordResetInputSchema as z.ZodType<
    AuthRequestPasswordResetInput,
    AuthRequestPasswordResetInput
  >;
const resetPasswordSchema = authResetPasswordInputSchema as z.ZodType<
  AuthResetPasswordInput,
  AuthResetPasswordInput
>;

function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer ? <CardFooter>{footer}</CardFooter> : null}
      </Card>
    </main>
  );
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Une erreur est survenue.";
  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const { form, handleSubmit, mutation } = useAuraForm<
    AuthRegisterInput,
    AuthSessionResult
  >({
    operationName: "auth.register",
    schema: registerSchema,
    defaultValues: {
      countryCode: "",
      phoneNumber: "",
      password: "",
    },
    mutation: {
      onSuccess() {
        // Fresh account always needs onboarding. A redirect param overrides
        // only if the user explicitly requested it (e.g. /onboarding itself).
        router.push(redirectTo || "/onboarding");
      },
    },
  });

  return (
    <AuthShell
      title="Créer un compte"
      description="Inscription rapide par téléphone et mot de passe."
      footer={
        <p className="text-sm text-muted-foreground">
          Déjà inscrit ? <Link className="underline" href="/login">Se connecter</Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel>Indicatif</FieldLabel>
            <CountryPhoneSelect
              value={form.watch("countryCode")}
              onChange={(v) => form.setValue("countryCode", v, { shouldValidate: true })}
              disabled={mutation.isPending}
            />
            <FieldError>{form.formState.errors.countryCode?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Numéro de téléphone</FieldLabel>
            <Input autoComplete="tel-national" {...form.register("phoneNumber")} />
            <FieldError>{form.formState.errors.phoneNumber?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Mot de passe</FieldLabel>
            <Input type="password" autoComplete="new-password" {...form.register("password")} />
            <FieldDescription>8 caractères minimum.</FieldDescription>
            <FieldError>{form.formState.errors.password?.message}</FieldError>
          </Field>
        </FieldGroup>
        <FormError error={mutation.error} />
        <Button className="w-full" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "Inscription..." : "Créer mon compte"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const { form, handleSubmit, mutation } = useAuraForm<
    AuthLoginInput,
    AuthSessionResult
  >({
    operationName: "auth.login",
    schema: loginSchema,
    defaultValues: {
      countryCode: "",
      phoneNumber: "",
      password: "",
    },
    mutation: {
      onSuccess(data) {
        // If onboarding is not completed, force it before going anywhere else.
        const user = data?.user;
        if (user && !user.onboardingCompleted) {
          router.push("/onboarding");
          return;
        }
        router.push(redirectTo);
      },
    },
  });

  return (
    <AuthShell
      title="Connexion"
      description="Connectez-vous avec votre téléphone et votre mot de passe."
      footer={
        <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
          <Link className="underline" href="/register">Créer un compte</Link>
          <Link className="underline" href="/reset-password">Mot de passe oublié</Link>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel>Indicatif</FieldLabel>
            <CountryPhoneSelect
              value={form.watch("countryCode")}
              onChange={(v) => form.setValue("countryCode", v, { shouldValidate: true })}
              disabled={mutation.isPending}
            />
            <FieldError>{form.formState.errors.countryCode?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Numéro de téléphone</FieldLabel>
            <Input autoComplete="tel-national" {...form.register("phoneNumber")} />
            <FieldError>{form.formState.errors.phoneNumber?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Mot de passe</FieldLabel>
            <Input type="password" autoComplete="current-password" {...form.register("password")} />
            <FieldError>{form.formState.errors.password?.message}</FieldError>
          </Field>
        </FieldGroup>
        <FormError error={mutation.error} />
        <Button className="w-full" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "Connexion..." : "Se connecter"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function VerifyPhoneForm() {
  return <OtpForm operationName="auth.verifyPhone" title="Vérifier le téléphone" />;
}

export function VerifyLoginForm() {
  return <OtpForm operationName="auth.verifyLoginOtp" title="Confirmer la connexion" />;
}

const OTP_LENGTH = 8;

function OtpForm({
  operationName,
  title,
}: {
  operationName: "auth.verifyPhone" | "auth.verifyLoginOtp";
  title: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone");
  const { form, handleSubmit, mutation } = useAuraForm<
    AuthVerifyOtpInput,
    AuthSessionResult
  >({
    operationName,
    schema: verifyOtpSchema,
    defaultValues: {
      challengeId: searchParams.get("challengeId") ?? "",
      code: "",
    },
    mutation: {
      onSuccess() {
        toast.success("Session ouverte");
        router.push("/dashboard");
      },
    },
  });

  return (
    <AuthShell
      title={title}
      description={phone ? `Code envoyé à ${phone}` : "Saisissez le code OTP reçu."}
      footer={
        <p className="text-sm text-muted-foreground">
          Mauvais numéro ? <Link className="underline" href="/login">Recommencer</Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel>Challenge</FieldLabel>
            <Input {...form.register("challengeId")} />
            <FieldDescription>Prérempli automatiquement après la demande de code.</FieldDescription>
            <FieldError>{form.formState.errors.challengeId?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Code OTP</FieldLabel>
            <InputOTP
              maxLength={OTP_LENGTH}
              className="justify-center"
              value={form.watch("code")}
              onChange={(value) => form.setValue("code", value, { shouldValidate: true })}
            >
              <InputOTPGroup className="justify-center">
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
                <InputOTPSlot index={6} />
                <InputOTPSlot index={7} />
              </InputOTPGroup>
            </InputOTP>
            <FieldError>{form.formState.errors.code?.message}</FieldError>
          </Field>
        </FieldGroup>
        <FormError error={mutation.error} />
        <Button className="w-full" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "Vérification..." : "Valider le code"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function RequestPasswordResetForm() {
  const router = useRouter();
  const { form, handleSubmit, mutation } = useAuraForm<
    AuthRequestPasswordResetInput,
    AuthChallengeResult | { sent: true }
  >({
    operationName: "auth.requestPasswordReset",
    schema: requestPasswordResetSchema,
    defaultValues: {
      countryCode: "",
      phoneNumber: "",
    },
    mutation: {
      onSuccess(data) {
        toast.info("Si le compte existe, un code a été envoyé.");
        if ("challengeId" in data) {
          router.push(
            `/reset-password/verify?challengeId=${encodeURIComponent(data.challengeId)}&phone=${encodeURIComponent(data.phoneE164)}`,
          );
        }
      },
    },
  });

  return (
    <AuthShell
      title="Réinitialiser le mot de passe"
      description="Recevez un code OTP pour définir un nouveau mot de passe."
      footer={<Link className="text-sm text-muted-foreground underline" href="/login">Retour connexion</Link>}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel>Indicatif</FieldLabel>
            <CountryPhoneSelect
              value={form.watch("countryCode")}
              onChange={(v) => form.setValue("countryCode", v, { shouldValidate: true })}
              disabled={mutation.isPending}
            />
            <FieldError>{form.formState.errors.countryCode?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Numéro de téléphone</FieldLabel>
            <Input autoComplete="tel-national" {...form.register("phoneNumber")} />
            <FieldError>{form.formState.errors.phoneNumber?.message}</FieldError>
          </Field>
        </FieldGroup>
        <FormError error={mutation.error} />
        <Button className="w-full" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "Envoi..." : "Recevoir un code"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone");
  const { form, handleSubmit, mutation } = useAuraForm<
    AuthResetPasswordInput,
    AuthSessionResult
  >({
    operationName: "auth.resetPassword",
    schema: resetPasswordSchema,
    defaultValues: {
      challengeId: searchParams.get("challengeId") ?? "",
      code: "",
      password: "",
    },
    mutation: {
      onSuccess() {
        router.push("/dashboard");
      },
    },
  });

  return (
    <AuthShell
      title="Nouveau mot de passe"
      description={phone ? `Code envoyé à ${phone}` : "Validez le code et choisissez un mot de passe."}
      footer={<Link className="text-sm text-muted-foreground underline" href="/login">Retour connexion</Link>}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel>Challenge</FieldLabel>
            <Input {...form.register("challengeId")} />
            <FieldError>{form.formState.errors.challengeId?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Code OTP</FieldLabel>
            <InputOTP
              maxLength={OTP_LENGTH}
              className="justify-center"
              value={form.watch("code")}
              onChange={(value) => form.setValue("code", value, { shouldValidate: true })}
            >
              <InputOTPGroup className="justify-center">
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
                <InputOTPSlot index={6} />
                <InputOTPSlot index={7} />
              </InputOTPGroup>
            </InputOTP>
            <FieldError>{form.formState.errors.code?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Nouveau mot de passe</FieldLabel>
            <Input type="password" autoComplete="new-password" {...form.register("password")} />
            <FieldError>{form.formState.errors.password?.message}</FieldError>
          </Field>
        </FieldGroup>
        <FormError error={mutation.error} />
        <Button className="w-full" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "Validation..." : "Mettre à jour"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function CurrentUserCard() {
  const me = useAuraQuery<AuthSessionResult>("auth.me", {
    retry: false,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session Aura</CardTitle>
        <CardDescription>État de l’utilisateur connecté.</CardDescription>
      </CardHeader>
      <CardContent>
        {me.isLoading ? <p>Chargement...</p> : null}
        {me.error ? <FormError error={me.error} /> : null}
        {me.data ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Utilisateur</dt>
              <dd className="font-mono">{me.data.user.id}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Téléphone</dt>
              <dd>{me.data.user.phoneE164}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Vérifié</dt>
              <dd>{me.data.user.phoneVerifiedAt ? "Oui" : "Non"}</dd>
            </div>
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const logout = useAuraMutation<undefined, { ok: true }>("auth.logout", {
    onSuccess() {
      router.push("/login");
    },
  });

  return (
    <Button
      disabled={logout.isPending}
      onClick={() => logout.mutate(undefined)}
      type="button"
      variant="outline"
    >
      {logout.isPending ? "Déconnexion..." : "Se déconnecter"}
    </Button>
  );
}
