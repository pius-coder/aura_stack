/**
 * `<AuraConfirmDialog>` — confirmation dialog for destructive actions.
 * Uses shadcn AlertDialog.
 */
"use client";

import { useState, type ReactElement } from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type { OperationRef } from "@/aura/core/types";
import { useAuraMutation } from "@/aura/client/hooks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/aura/ui/alert-dialog";

export interface AuraConfirmDialogProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  mutation?: OperationRef | string;
  input?: unknown;
  onConfirm?: () => void;
  onCancel?: () => void;
  trigger: ReactElement;
}

export function AuraConfirmDialog({
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "destructive",
  mutation,
  input,
  onConfirm,
  onCancel,
  trigger,
}: AuraConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const mutationHook = useAuraMutation<unknown, unknown>(
    typeof mutation === "string" ? mutation : (mutation?._name ?? "noop"),
    {
      onSuccess: () => {
        setOpen(false);
        onConfirm?.();
      },
    },
  );

  const handleConfirm = () => {
    if (mutation) {
      mutationHook.mutate(input);
    } else {
      onConfirm?.();
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogPrimitive.Trigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onCancel?.()}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={mutationHook.isPending}
            className={variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {mutationHook.isPending ? "..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
