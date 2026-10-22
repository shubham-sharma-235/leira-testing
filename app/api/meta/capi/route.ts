import { NextRequest, NextResponse } from "next/server";
import { handleRelayRequest, MAX_BODY_BYTES } from "@/lib/analytics/metaCapi.server";

/**
 * Meta Conversions API relay for browser-originated events.
 *
 * Receives { eventName, eventId, eventSourceUrl, customData } from
 * sendMetaServerEvent() in lib/analytics/metaPixel.ts and forwards it to Meta
 * with the same event_id the browser Pixel used, so Meta deduplicates them.
 *
 * Purchase is NOT accepted here — see lib/analytics/metaCapi.server.ts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413, headers: NO_STORE });
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: NO_STORE });
  }

  const result = await handleRelayRequest({ headers: request.headers, bodyText });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { ...NO_STORE, ...(result.headers || {}) },
  });
}
