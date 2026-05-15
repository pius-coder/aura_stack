/**
 * `<AuraLoadingSkeleton>` — skeleton loader using shadcn Skeleton primitive.
 */
import { Skeleton } from "@/aura/ui/skeleton";
import { cn } from "@/lib/utils";

export interface AuraLoadingSkeletonProps {
  lines?: number;
  className?: string;
}

export function AuraLoadingSkeleton({ lines = 3, className }: AuraLoadingSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: `${Math.max(40, 100 - i * 15)}%` }}
        />
      ))}
    </div>
  );
}
