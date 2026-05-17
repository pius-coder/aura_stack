import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuraQuery } from "@/aura/client";
import { api } from "@/aura/_generated/api";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const Route = createFileRoute("/sign-up")({ component: SignUpPage });

function SignUpPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useAuraQuery(api.auth["vibe-me"]);

  if (!isLoading && data?.user) {
    navigate({ to: "/app" });
    return null;
  }

  return (
    <AuthLayout title="Créer un compte" subtitle="Rejoignez Orya et connectez-vous aux bonnes personnes.">
      <SignUpForm />
      <p className="mt-6 text-center text-xs text-slate-500">
        Déjà un compte ?{" "}
        <Link to="/sign-in" className="font-medium text-blue-600 hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthLayout>
  );
}
