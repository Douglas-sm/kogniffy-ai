import * as fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  "group1-shard1of1.bin": "application/octet-stream",
  "metadata.json": "application/json; charset=utf-8",
  "model.json": "application/json; charset=utf-8",
  "normalization.json": "application/json; charset=utf-8"
};

export async function GET(
  _: Request,
  context: { params: Promise<{ asset: string }> }
) {
  const { asset } = await context.params;
  const contentType = CONTENT_TYPES[asset];

  if (!contentType) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "models", "adhd", asset);

  try {
    const file = await fs.readFile(filePath);
    return new NextResponse(file, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": contentType
      }
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
