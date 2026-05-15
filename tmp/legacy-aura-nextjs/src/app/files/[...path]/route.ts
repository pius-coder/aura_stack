import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const STORAGE_PATH = process.env.AURA_STORAGE_PATH || "storage/files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join("/");

  // Prevent path traversal.
  // `turbopackIgnore` tells the Next file-tracer to NOT follow these paths
  // — they are runtime-only, resolved from process.cwd() at request time.
  const base = join(/* turbopackIgnore: true */ process.cwd(), STORAGE_PATH);
  const filePath = join(/* turbopackIgnore: true */ base, key);
  if (!filePath.startsWith(base + "/") && filePath !== base) {
    return NextResponse.json({ ok: false, error: "Invalid path" }, { status: 400 });
  }

  try {
    const file = await readFile(filePath);
    // Simple mime type detection by extension
    const ext = key.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      pdf: "application/pdf",
      txt: "text/plain",
    };
    const contentType = mimeTypes[ext || ""] || "application/octet-stream";

    return new NextResponse(file, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "File not found" }, { status: 404 });
  }
}
