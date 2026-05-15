/**
 * `@/aura/ui` — built-in Aura UI kit (shadcn-based, kebab-case).
 *
 * High-level composite components that ship out-of-the-box, all built on
 * top of the shadcn primitives in this same folder.
 */

export { AuraBumpToaster, pushBumps } from "./aura-bump-toaster";
export type { AuraBumpToasterProps } from "./aura-bump-toaster";

export { AuraDataTable } from "./aura-data-table";
export type { AuraDataTableProps, AuraDataTableColumn, AuraDataTableAction } from "./aura-data-table";

export { AuraForm } from "./aura-form";
export type { AuraFormProps, AuraFormField } from "./aura-form";

export { AuraAuthCard } from "./aura-auth-card";
export type { AuraAuthCardProps, AuraAuthMode } from "./aura-auth-card";

export { AuraGuardView } from "./aura-guard-view";
export type { AuraGuardViewProps } from "./aura-guard-view";

export { AuraConfirmDialog } from "./aura-confirm-dialog";
export type { AuraConfirmDialogProps } from "./aura-confirm-dialog";

export { AuraFileUpload } from "./aura-file-upload";
export type { AuraFileUploadProps } from "./aura-file-upload";

export { AuraSearchInput } from "./aura-search-input";
export type { AuraSearchInputProps } from "./aura-search-input";

export { AuraEmptyState } from "./aura-empty-state";
export type { AuraEmptyStateProps } from "./aura-empty-state";

export { AuraErrorBoundary } from "./aura-error-boundary";
export type { AuraErrorBoundaryProps } from "./aura-error-boundary";

export { AuraLoadingSkeleton } from "./aura-loading-skeleton";
export type { AuraLoadingSkeletonProps } from "./aura-loading-skeleton";

export { AuraAgentChat } from "./aura-agent-chat";
export type { AuraAgentChatProps } from "./aura-agent-chat";

export { AuraSettingsLayout } from "./aura-settings-layout";
export type { AuraSettingsLayoutProps, AuraSettingsNavItem } from "./aura-settings-layout";

export { AuraDashboardShell } from "./aura-dashboard-shell";
export type { AuraDashboardShellProps, AuraDashboardNavItem } from "./aura-dashboard-shell";
