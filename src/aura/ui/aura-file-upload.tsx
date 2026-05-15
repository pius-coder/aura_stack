/**
 * `<AuraFileUpload>` — drag-and-drop file upload using shadcn primitives.
 */
"use client";

import { useCallback, useState, useRef } from "react";
import { Button } from "@/aura/ui/button";
import { cn } from "@/lib/utils";

export interface AuraFileUploadProps {
  onUpload: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  label?: string;
  className?: string;
}

export function AuraFileUpload({
  onUpload,
  accept,
  multiple,
  maxSize,
  label,
  className,
}: AuraFileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const arr = Array.from(files);
      const valid = maxSize ? arr.filter((f) => f.size <= maxSize) : arr;
      if (valid.length > 0) onUpload(valid);
    },
    [onUpload, maxSize],
  );

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-muted-foreground text-sm mb-3">
        {label ?? "Glissez vos fichiers ici ou cliquez pour sélectionner"}
      </p>
      <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
        Parcourir
      </Button>
    </div>
  );
}
