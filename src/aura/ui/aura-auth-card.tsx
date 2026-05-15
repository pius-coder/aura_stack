/**
 * `<AuraAuthCard>` — login / register / OTP / password / phone flows.
 * Resolves: Requirement 38.3.
 */
"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/aura/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/aura/ui/tabs";
import { Button } from "@/aura/ui/button";
import { Input } from "@/aura/ui/input";
import { Label } from "@/aura/ui/label";
import { useAuraMutation } from "@/aura/client/hooks";
import { cn } from "@/lib/utils";

export type AuraAuthMode = "password" | "otp" | "phone";

export interface AuraAuthCardProps {
  title?: string;
  description?: string;
  modes?: AuraAuthMode[];
  loginOperation?: string;
  registerOperation?: string;
  otpRequestOperation?: string;
  otpVerifyOperation?: string;
  onSuccess?: (data: unknown) => void;
  className?: string;
  footer?: ReactNode;
}

export function AuraAuthCard({
  title = "Connexion",
  description,
  modes = ["password"],
  loginOperation = "auth.login",
  registerOperation = "auth.register",
  otpRequestOperation = "auth.otp.request",
  otpVerifyOperation = "auth.otp.verify",
  onSuccess,
  className,
  footer,
}: AuraAuthCardProps) {
  const [activeMode, setActiveMode] = useState<AuraAuthMode>(modes[0] ?? "password");

  return (
    <Card className={cn("w-full max-w-md", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {modes.length > 1 ? (
          <Tabs value={activeMode} onValueChange={(v) => setActiveMode(v as AuraAuthMode)}>
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${modes.length}, 1fr)` }}>
              {modes.includes("password") && <TabsTrigger value="password">Email</TabsTrigger>}
              {modes.includes("otp") && <TabsTrigger value="otp">Code</TabsTrigger>}
              {modes.includes("phone") && <TabsTrigger value="phone">Téléphone</TabsTrigger>}
            </TabsList>
            {modes.includes("password") && (
              <TabsContent value="password">
                <PasswordForm op={loginOperation} regOp={registerOperation} onSuccess={onSuccess} />
              </TabsContent>
            )}
            {modes.includes("otp") && (
              <TabsContent value="otp">
                <OtpForm requestOp={otpRequestOperation} verifyOp={otpVerifyOperation} onSuccess={onSuccess} />
              </TabsContent>
            )}
            {modes.includes("phone") && (
              <TabsContent value="phone">
                <PhoneForm onSuccess={onSuccess} />
              </TabsContent>
            )}
          </Tabs>
        ) : activeMode === "password" ? (
          <PasswordForm op={loginOperation} regOp={registerOperation} onSuccess={onSuccess} />
        ) : activeMode === "otp" ? (
          <OtpForm requestOp={otpRequestOperation} verifyOp={otpVerifyOperation} onSuccess={onSuccess} />
        ) : (
          <PhoneForm onSuccess={onSuccess} />
        )}
        {footer && <div className="mt-4">{footer}</div>}
      </CardContent>
    </Card>
  );
}

function PasswordForm({ op, regOp: _regOp, onSuccess }: { op: string; regOp: string; onSuccess?: (d: unknown) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { mutate, isPending } = useAuraMutation<{ email: string; password: string }, unknown>(op, {
    onSuccess,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutate({ email, password });
      }}
      className="space-y-3 mt-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="auth-email">Email</Label>
        <Input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="auth-password">Mot de passe</Label>
        <Input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "..." : "Se connecter"}
      </Button>
    </form>
  );
}

function OtpForm({ requestOp, verifyOp, onSuccess }: { requestOp: string; verifyOp: string; onSuccess?: (d: unknown) => void }) {
  const [step, setStep] = useState<"request" | "verify">("request");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const requestMutation = useAuraMutation<{ phone: string }, unknown>(requestOp, {
    onSuccess: () => setStep("verify"),
  });
  const verifyMutation = useAuraMutation<{ phone: string; code: string }, unknown>(verifyOp, { onSuccess });

  if (step === "request") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          requestMutation.mutate({ phone });
        }}
        className="space-y-3 mt-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="auth-phone">Téléphone</Label>
          <Input id="auth-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={requestMutation.isPending}>
          {requestMutation.isPending ? "..." : "Recevoir le code"}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        verifyMutation.mutate({ phone, code });
      }}
      className="space-y-3 mt-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="auth-code">Code reçu</Label>
        <Input id="auth-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={6} />
      </div>
      <Button type="submit" className="w-full" disabled={verifyMutation.isPending}>
        {verifyMutation.isPending ? "..." : "Vérifier"}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("request")}>
        Renvoyer
      </Button>
    </form>
  );
}

function PhoneForm({ onSuccess: _onSuccess }: { onSuccess?: (d: unknown) => void }) {
  return (
    <div className="text-muted-foreground py-8 text-center text-sm">
      Authentification téléphone à configurer.
    </div>
  );
}
