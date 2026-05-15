# Storage

Aura ships a uniform file storage facade with two drivers:

| Driver | When | Required env |
|--------|------|--------------|
| `filesystem` | Dev, single-node deployments | `AURA_STORAGE_PATH` |
| `s3` | Production, multi-node, S3-compatible (AWS, Backblaze B2, R2, MinIO) | `AURA_S3_BUCKET`, `AURA_S3_REGION`, `AURA_S3_ACCESS_KEY_ID`, `AURA_S3_SECRET_ACCESS_KEY`, `AURA_S3_ENDPOINT` (optional) |

Selected via `AURA_STORAGE_DRIVER` (`filesystem` by default).

## Upload from an action

```ts
import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("uploads.create")
  .action()
  .input(z.object({ file: z.instanceof(File), filename: z.string() }))
  .auth()
  .handler(async ({ ctx, input }) => {
    const storageId = await ctx.storage.store(input.file, {
      filename: input.filename,
      contentType: input.file.type,
    });

    // Persist a reference if needed
    await ctx.runMutation("documents.create", {
      storageId,
      filename: input.filename,
    });

    return { storageId, url: ctx.storage.getUrl(storageId) };
  });
```

`ctx.storage.store()`:

1. Generates a `storageId` (random base32).
2. Writes the file via the active driver (filesystem → `${AURA_STORAGE_PATH}/${storageId}`; s3 → bucket put).
3. Inserts an `AuraStoredFile` row tracking metadata.
4. Returns the `storageId`.

## Get a URL

```ts
const url = ctx.storage.getUrl(storageId);
// filesystem driver  →  /files/<storageId>/<filename>
// s3 driver          →  pre-signed S3 URL valid for 1 hour
```

## Delete

```ts
await ctx.storage.delete(storageId);
// Removes the file from the driver and deletes the AuraStoredFile row.
```

## Filesystem driver

Files are written under `${AURA_STORAGE_PATH}/${storageId}`. The Aura `/files/*` Hono route serves them with:

- Path traversal rejection (`..` paths return 400)
- MIME type detection by extension (`png`, `jpg`, `webp`, `gif`, `pdf`, `txt`)
- `Cache-Control: public, max-age=86400`

In dev, point `AURA_STORAGE_PATH` to a local folder and add it to `.gitignore`:

```bash
AURA_STORAGE_PATH="./uploads"
```

```
# .gitignore
/uploads
```

## S3 driver

Set `AURA_STORAGE_DRIVER=s3` and provide credentials:

```bash
AURA_STORAGE_DRIVER=s3
AURA_S3_BUCKET=my-app-uploads
AURA_S3_REGION=eu-west-3
AURA_S3_ACCESS_KEY_ID=AKIA...
AURA_S3_SECRET_ACCESS_KEY=...
# Optional, for non-AWS providers (R2, MinIO)
AURA_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

Aura uses `@aws-sdk/client-s3` under the hood — works with any S3-compatible storage.

`getUrl()` returns a **pre-signed URL** valid for 1 hour. Aura's `/files/*` route is **not** used for the S3 driver — clients hit the pre-signed URL directly.

## Client-side upload

Use `<AuraFileUpload>` from the UI kit:

```tsx
import { AuraFileUpload } from "@/aura/ui";
import { useAuraMutation } from "@/aura/client";
import { api } from "@/aura/_generated/api";

const create = useAuraMutation(api.uploads.create);

<AuraFileUpload
  accept="image/*"
  maxSize={5 * 1024 * 1024}
  onUpload={async (files) => {
    for (const file of files) {
      await create.mutateAsync({ file, filename: file.name });
    }
  }}
/>
```

## File model

```prisma
model AuraStoredFile {
  id          String   @id @default(cuid())
  filename    String
  contentType String
  size        Int
  path        String   @unique
  driver      String   @default("filesystem")
  uploadedBy  String?
  metadata    Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([driver])
  @@index([uploadedBy])
}
```

## Quotas & access control

Aura doesn't enforce quotas or per-file access control out of the box. Implement these in your operations:

```ts
.action()
.handler(async ({ ctx, input }) => {
  const used = await ctx.db.auraStoredFile.aggregate({
    where: { uploadedBy: ctx.user.id },
    _sum: { size: true },
  });
  if ((used._sum.size ?? 0) + input.file.size > 100 * 1024 * 1024) {
    throw new AuraError("BAD_REQUEST", "Quota dépassé.");
  }
  return ctx.storage.store(input.file, { ... });
});
```

For per-file access control, gate `getUrl` behind a query that checks ownership.
