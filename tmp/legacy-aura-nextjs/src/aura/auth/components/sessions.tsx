"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuraMutation } from "@/aura/client";
import { Button } from "@/components/ui/button";

export function RevokeAllSessionsButton() {
  const router = useRouter();
  const revoke = useAuraMutation<undefined, { ok: true }>("auth.revokeAllSessions", {
    onSuccess() {
      toast.success("Sessions révoquées");
      router.push("/login");
    },
  });

  return (
    <Button
      variant="destructive"
      disabled={revoke.isPending}
      onClick={() => revoke.mutate(undefined)}
    >
      {revoke.isPending ? "Révocation..." : "Révoquer toutes les sessions"}
    </Button>
  );
}
