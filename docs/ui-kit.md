# UI Kit

Aura ships a set of high-level React components in `src/aura/ui/`, all built on **shadcn/ui primitives** + Tailwind CSS. Every file follows kebab-case naming (`aura-data-table.tsx`, `aura-form.tsx`, …).

## Setup

The kit assumes `@/lib/utils.ts` exports the shadcn `cn()` helper:

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Tailwind needs the shadcn theme tokens in `styles.css` (already configured in this project).

## Components

### `<AuraBumpToaster>`

Auto-displays server-side `ctx.bump.success/error/info/warning` calls as sonner toasts. Mount once in the root layout.

```tsx
import { AuraBumpToaster } from "@/aura/ui";

<AuraBumpToaster position="bottom-right" richColors />
```

### `<AuraDataTable>`

Server-paginated, sortable, filterable data table wired to `useAuraPaginatedQuery`. Built on shadcn `<Table>` + `<Input>` + `<Button>`.

```tsx
<AuraDataTable
  query={api.orders.list}
  columns={[
    { key: "id", label: "ID" },
    { key: "status", label: "Statut" },
    { key: "total", label: "Total", format: "currency" },
    { key: "createdAt", label: "Date", format: "relative" },
  ]}
  searchable={{ placeholder: "Rechercher..." }}
  actions={[
    { label: "Voir", href: (row) => `/orders/${row.id}` },
    { label: "Annuler", onClick: (row) => cancel.mutate({ id: row.id }), variant: "destructive" },
  ]}
  empty={{ title: "Aucune commande", description: "Les commandes apparaîtront ici." }}
/>
```

The table fetches the first page on mount and uses TanStack Query's `useInfiniteQuery` for pagination. Search input debounces 300 ms and is sent as `input.search` to the operation.

### `<AuraForm>`

Auto-generated form from a Zod schema, wired to `useAuraMutation`.

```tsx
import { z } from "zod";

const ProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  category: z.enum(["a", "b", "c"]),
  description: z.string().optional(),
});

<AuraForm
  mutation={api.catalog.createProduct}
  schema={ProductSchema}
  fields={[
    { name: "name", label: "Nom", required: true },
    { name: "price", label: "Prix", type: "number" },
    { name: "category", label: "Catégorie", type: "select", options: [
      { value: "a", label: "A" }, { value: "b", label: "B" }, { value: "c", label: "C" }
    ]},
    { name: "description", label: "Description", type: "textarea" },
  ]}
  submitLabel="Créer"
  onSuccess={(p) => router.navigate({ to: `/products/${p.id}` })}
/>
```

Field types: `text | number | email | password | select | textarea | date | file | checkbox`.

### `<AuraAuthCard>`

Login/register/OTP/phone flows in a card.

```tsx
<AuraAuthCard
  modes={["password", "otp"]}
  loginOperation="auth.login"
  otpRequestOperation="auth.otp.request"
  otpVerifyOperation="auth.otp.verify"
  onSuccess={() => router.navigate({ to: "/" })}
/>
```

### `<AuraGuardView>`

Wraps a page with auth + role checks. Shows loading skeleton, unauthenticated fallback, and unauthorized message.

```tsx
<AuraGuardView redirectTo="/login">
  <Settings />
</AuraGuardView>
```

### `<AuraConfirmDialog>`

Destructive-action confirmation using shadcn `<AlertDialog>`.

```tsx
<AuraConfirmDialog
  title="Supprimer cette commande ?"
  description="Cette action est irréversible."
  variant="destructive"
  mutation={api.orders.delete}
  input={{ id: order.id }}
  trigger={<Button variant="destructive">Supprimer</Button>}
/>
```

The dialog calls `mutation.mutate(input)` on confirm and closes on success.

### `<AuraFileUpload>`

Drag-and-drop file upload. Wire to `ctx.storage.store` server-side.

```tsx
<AuraFileUpload
  accept="image/*"
  multiple
  maxSize={5 * 1024 * 1024}
  onUpload={(files) => upload.mutate({ files })}
/>
```

### `<AuraSearchInput>`

Debounced search input.

```tsx
<AuraSearchInput
  onSearch={(q) => setSearch(q)}
  placeholder="Rechercher des produits..."
  debounceMs={300}
/>
```

### `<AuraEmptyState>`

```tsx
<AuraEmptyState
  title="Aucune tâche"
  description="Créez votre première tâche pour commencer."
  action={{ label: "Nouvelle tâche", onClick: () => setOpen(true) }}
/>
```

### `<AuraErrorBoundary>`

```tsx
<AuraErrorBoundary fallback={(err, reset) => <CustomErrorView err={err} onRetry={reset} />}>
  <RiskyComponent />
</AuraErrorBoundary>
```

Default fallback is a shadcn `<Card>` with the error message and a retry button.

### `<AuraLoadingSkeleton>`

```tsx
<AuraLoadingSkeleton lines={5} />
```

### `<AuraAgentChat>`

Full AI chat UI with streaming, tool calls, and human-in-the-loop approvals.

```tsx
<AuraAgentChat
  agentName="ai.customer-support"
  threadId={threadId}
  title="Support"
  showToolCalls
  showSources
/>
```

Wires automatically to `useAuraAgentThread` (message list, polled every 2 s) and `useAuraAgentStream` (live token deltas via BroadcastChannel).

### `<AuraSettingsLayout>` & `<AuraDashboardShell>`

Page layouts.

```tsx
<AuraSettingsLayout
  title="Paramètres"
  nav={[
    { label: "Profil", href: "/settings/profile", active: true },
    { label: "Sécurité", href: "/settings/security" },
    { label: "Facturation", href: "/settings/billing" },
  ]}
>
  <ProfileForm />
</AuraSettingsLayout>

<AuraDashboardShell
  brand={<Logo />}
  nav={[{ label: "Accueil", href: "/" }, { label: "Commandes", href: "/orders" }]}
  header={<UserMenu />}
>
  <PageContent />
</AuraDashboardShell>
```

## Theming

Aura UI components use shadcn's CSS variables (`--primary`, `--secondary`, `--muted`, `--destructive`, `--background`, `--foreground`, `--border`, `--input`, `--ring`, etc.). Set them in `styles.css` to brand the kit:

```css
:root {
  --primary: 224 76% 48%;        /* HSL */
  --primary-foreground: 0 0% 100%;
  /* … */
}
.dark { /* dark theme overrides */ }
```

## Generating new UI components

```bash
bun aura:make ui <component-name>
```

Creates `src/aura/ui/<component-name>.tsx` with a stub that imports `@/lib/utils` and shadcn primitives.
