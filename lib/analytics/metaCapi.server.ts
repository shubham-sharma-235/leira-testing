/**
 * Meta Conversions API relay — SERVER ONLY.
 *
 * Used by app/api/meta/capi/route.ts. Never import this from a "use client"
 * file: it reads META_CAPI_ACCESS_TOKEN, which must stay on the server.
 *
 * What this relay accepts: upper-funnel events fired in the browser
 * (ViewContent, AddToCart, …) so Meta receives a server copy with the SAME
 * event_id as the browser Pixel event and can deduplicate the two.
 *
 * What it deliberately refuses: Purchase. A browser request is not proof that
 * an order was paid, so Purchase must be sent by the backend after the
 * Razorpay signature / order status has been verified.
 */
import { isIP } from "node:net";

/** Checked against Meta's changelog: no Conversions API changes between v23.0 and v26.0.
 *  v25.0 is the version used in Meta's current CAPI docs; supported until July 2028. */
export const META_GRAPH_API_VERSION = "v25.0";
export const META_CAPI_TIMEOUT_MS = 5000;
export const MAX_BODY_BYTES = 8 * 1024;

export const RELAY_EVENT_NAMES = [
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "AddPaymentInfo",
  "AddToWishlist",
  "Contact",
] as const;
export type RelayEventName = (typeof RELAY_EVENT_NAMES)[number];

/** Same pattern the browser helper produces (`addtocart.<uuid>`) and order numbers satisfy. */
export const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const CONTENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const FBP_PATTERN = /^fb\.[0-2]\.\d{10,13}\.[A-Za-z0-9_-]{1,64}$/;
const FBC_PATTERN = /^fb\.[0-2]\.\d{10,13}\.[A-Za-z0-9_-]{1,500}(?:\.[A-Za-z0-9_-]{1,64})?$/;
const FBCLID_PATTERN = /^[A-Za-z0-9_-]{1,500}$/;
const DATASET_ID_PATTERN = /^\d{10,20}$/;
const TEST_EVENT_CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/;
const MAX_VALUE_INR = 10_000_000;

/** Headers that may carry the visitor IP. Only the one named in
 *  META_CAPI_CLIENT_IP_HEADER is ever read, and only because Nginx sets it. */
const SUPPORTED_IP_HEADERS = new Set(["x-real-ip", "x-forwarded-for"]);

const DEFAULT_ALLOWED_HOSTS = ["leiraindia.com", "www.leiraindia.com"];

export type MetaContent = { id: string; quantity: number; item_price?: number };

export type RelayCustomData = {
  value?: number;
  currency?: "INR";
  content_ids?: string[];
  content_type?: "product" | "product_group";
  content_name?: string;
  contents?: MetaContent[];
  num_items?: number;
};

export type RelayEvent = {
  eventName: RelayEventName;
  eventId: string;
  eventSourceUrl: string;
  customData: RelayCustomData;
};

export type CapiConfig = {
  datasetId: string;
  accessToken: string;
  testEventCode?: string;
  clientIpHeader?: string;
  allowedHosts: Set<string>;
  allowHttpLocalhost: boolean;
};

type Env = Record<string, string | undefined>;
type Logger = Pick<Console, "warn" | "error">;

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

export function readCapiConfig(env: Env): { ok: true; config: CapiConfig } | { ok: false; reason: string } {
  const datasetId = String(env.META_PIXEL_ID || "").trim();
  const accessToken = String(env.META_CAPI_ACCESS_TOKEN || "").trim();
  if (!datasetId || !accessToken) return { ok: false, reason: "META_PIXEL_ID or META_CAPI_ACCESS_TOKEN is not set" };
  if (!DATASET_ID_PATTERN.test(datasetId)) return { ok: false, reason: "META_PIXEL_ID is not a numeric dataset/Pixel ID" };
  if (/\s/.test(accessToken)) return { ok: false, reason: "META_CAPI_ACCESS_TOKEN contains whitespace" };

  const rawTestCode = String(env.META_CAPI_TEST_EVENT_CODE || "").trim();
  const testEventCode = rawTestCode && TEST_EVENT_CODE_PATTERN.test(rawTestCode) ? rawTestCode : undefined;

  const rawIpHeader = String(env.META_CAPI_CLIENT_IP_HEADER || "").trim().toLowerCase();
  const clientIpHeader = SUPPORTED_IP_HEADERS.has(rawIpHeader) ? rawIpHeader : undefined;

  const isProduction = env.NODE_ENV === "production";
  const allowedHosts = new Set(DEFAULT_ALLOWED_HOSTS);
  const siteUrl = String(env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (siteUrl) {
    try {
      allowedHosts.add(new URL(siteUrl).hostname.toLowerCase());
    } catch {
      /* ignore malformed NEXT_PUBLIC_SITE_URL */
    }
  }
  if (!isProduction) {
    allowedHosts.add("localhost");
    allowedHosts.add("127.0.0.1");
  }

  return {
    ok: true,
    config: {
      datasetId,
      accessToken,
      testEventCode,
      clientIpHeader,
      allowedHosts,
      allowHttpLocalhost: !isProduction,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** https URL on an approved Leira host (http only for localhost outside production). */
export function validateSiteUrl(
  raw: unknown,
  allowedHosts: Set<string>,
  allowHttpLocalhost: boolean
): Result<string> {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return { ok: false, error: "eventSourceUrl" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "eventSourceUrl" };
  }
  const host = url.hostname.toLowerCase();
  const schemeOk = url.protocol === "https:" || (allowHttpLocalhost && url.protocol === "http:" && isLocalHost(host));
  if (!schemeOk || url.username || url.password || !allowedHosts.has(host)) return { ok: false, error: "eventSourceUrl" };
  url.hash = "";
  return { ok: true, value: url.toString() };
}

function validateContentIds(raw: unknown): Result<string[]> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return { ok: false, error: "customData.content_ids" };
  const ids: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || !CONTENT_ID_PATTERN.test(id)) return { ok: false, error: "customData.content_ids" };
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, value: ids };
}

function validateContents(raw: unknown): Result<MetaContent[]> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return { ok: false, error: "customData.contents" };
  const out: MetaContent[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return { ok: false, error: "customData.contents" };
    for (const k of Object.keys(item)) {
      if (k !== "id" && k !== "quantity" && k !== "item_price") return { ok: false, error: "customData.contents" };
    }
    const { id, quantity, item_price } = item;
    if (typeof id !== "string" || !CONTENT_ID_PATTERN.test(id)) return { ok: false, error: "customData.contents" };
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return { ok: false, error: "customData.contents" };
    }
    const entry: MetaContent = { id, quantity };
    if (item_price !== undefined) {
      if (typeof item_price !== "number" || !Number.isFinite(item_price) || item_price < 0 || item_price > MAX_VALUE_INR) {
        return { ok: false, error: "customData.contents" };
      }
      entry.item_price = roundMoney(item_price);
    }
    out.push(entry);
  }
  return { ok: true, value: out };
}

const CUSTOM_DATA_KEYS = new Set([
  "value",
  "currency",
  "content_ids",
  "content_type",
  "content_name",
  "contents",
  "num_items",
]);

function validateCustomData(raw: unknown): Result<RelayCustomData> {
  if (raw === undefined) return { ok: true, value: {} };
  if (!isPlainObject(raw)) return { ok: false, error: "customData" };
  for (const k of Object.keys(raw)) {
    if (!CUSTOM_DATA_KEYS.has(k)) return { ok: false, error: `customData.${k.slice(0, 40)}` };
  }
  const out: RelayCustomData = {};

  if (raw.value !== undefined) {
    const v = raw.value;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_VALUE_INR) return { ok: false, error: "customData.value" };
    out.value = roundMoney(v);
  }
  if (raw.currency !== undefined) {
    if (raw.currency !== "INR") return { ok: false, error: "customData.currency" };
    out.currency = "INR";
  }
  if (out.value !== undefined && out.currency === undefined) return { ok: false, error: "customData.currency" };

  if (raw.content_ids !== undefined) {
    const r = validateContentIds(raw.content_ids);
    if (!r.ok) return r;
    out.content_ids = r.value;
  }
  if (raw.content_type !== undefined) {
    if (raw.content_type !== "product" && raw.content_type !== "product_group") return { ok: false, error: "customData.content_type" };
    out.content_type = raw.content_type;
  }
  if (raw.content_name !== undefined) {
    if (typeof raw.content_name !== "string") return { ok: false, error: "customData.content_name" };
    // eslint-disable-next-line no-control-regex
    const name = raw.content_name.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (!name || name.length > 200) return { ok: false, error: "customData.content_name" };
    out.content_name = name;
  }
  if (raw.contents !== undefined) {
    const r = validateContents(raw.contents);
    if (!r.ok) return r;
    out.contents = r.value;
  }
  if (raw.num_items !== undefined) {
    const n = raw.num_items;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 9999) return { ok: false, error: "customData.num_items" };
    out.num_items = n;
  }
  return { ok: true, value: out };
}

const BODY_KEYS = new Set(["eventName", "eventId", "eventSourceUrl", "customData"]);

/** Strict validation of the JSON body sent by sendMetaServerEvent() in lib/analytics/metaPixel.ts. */
export function validateRelayBody(
  raw: unknown,
  opts: { allowedHosts: Set<string>; allowHttpLocalhost: boolean }
): Result<RelayEvent> {
  if (!isPlainObject(raw)) return { ok: false, error: "body" };
  for (const k of Object.keys(raw)) {
    if (!BODY_KEYS.has(k)) return { ok: false, error: `unexpected field ${k.slice(0, 40)}` };
  }
  const { eventName, eventId } = raw;
  if (typeof eventName !== "string" || !(RELAY_EVENT_NAMES as readonly string[]).includes(eventName)) {
    return { ok: false, error: "eventName" };
  }
  if (typeof eventId !== "string" || !EVENT_ID_PATTERN.test(eventId)) return { ok: false, error: "eventId" };
  const url = validateSiteUrl(raw.eventSourceUrl, opts.allowedHosts, opts.allowHttpLocalhost);
  if (!url.ok) return url;
  const custom = validateCustomData(raw.customData);
  if (!custom.ok) return custom;
  return {
    ok: true,
    value: {
      eventName: eventName as RelayEventName,
      eventId,
      eventSourceUrl: url.value,
      customData: custom.value,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Request context: cookies, IP, origin                                */
/* ------------------------------------------------------------------ */

export function parseCookieHeader(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    if (!name || out.has(name)) continue;
    try {
      out.set(name, decodeURIComponent(raw));
    } catch {
      out.set(name, raw);
    }
  }
  return out;
}

/** _fbp / _fbc are first-party cookies on leiraindia.com, so the browser sends them with this same-origin request.
 *  If _fbc is missing but the landing URL carries ?fbclid=, build fbc in Meta's documented format. */
export function resolveFbpFbc(
  cookieHeader: string | null,
  eventSourceUrl: string,
  nowMs: number
): { fbp?: string; fbc?: string } {
  const cookies = parseCookieHeader(cookieHeader);
  const out: { fbp?: string; fbc?: string } = {};
  const fbp = cookies.get("_fbp");
  if (fbp && FBP_PATTERN.test(fbp)) out.fbp = fbp;
  const fbc = cookies.get("_fbc");
  if (fbc && FBC_PATTERN.test(fbc)) {
    out.fbc = fbc;
  } else {
    try {
      const fbclid = new URL(eventSourceUrl).searchParams.get("fbclid");
      if (fbclid && FBCLID_PATTERN.test(fbclid)) out.fbc = `fb.1.${nowMs}.${fbclid}`;
    } catch {
      /* ignore */
    }
  }
  return out;
}

function isUsablePublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    return true;
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return false;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return false;
    return true;
  }
  return false;
}

/**
 * Reads the visitor IP ONLY from the header Nginx is configured to set
 * (META_CAPI_CLIENT_IP_HEADER). With x-forwarded-for, the right-most entry is
 * the address Nginx itself saw ($proxy_add_x_forwarded_for appends it), so
 * anything a visitor prepends is ignored.
 */
export function resolveClientIp(headers: Headers, trustedHeader: string | undefined): string | undefined {
  if (!trustedHeader) return undefined;
  const raw = headers.get(trustedHeader);
  if (!raw) return undefined;
  let candidate =
    trustedHeader === "x-forwarded-for"
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .pop() || ""
      : raw.trim();
  if (candidate.startsWith("[") && candidate.includes("]")) candidate = candidate.slice(1, candidate.indexOf("]"));
  return isUsablePublicIp(candidate) ? candidate : undefined;
}

/** Same-site browser requests only. Blocks other websites from posting events through Leira's token. */
export function isAllowedOrigin(headers: Headers, allowedHosts: Set<string>, allowHttpLocalhost: boolean): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") return false;
  const source = headers.get("origin") || headers.get("referer");
  if (!source) return false;
  return validateSiteUrl(source, allowedHosts, allowHttpLocalhost).ok;
}

/* ------------------------------------------------------------------ */
/* Rate limiting (per process — PM2 cluster mode multiplies the limit) */
/* ------------------------------------------------------------------ */

export class FixedWindowRateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 20_000
  ) {}

  check(key: string, now: number): { allowed: boolean; retryAfterSec: number } {
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      if (this.hits.size >= this.maxKeys) this.prune(now);
      this.hits.set(key, { windowStart: now, count: 1 });
      return { allowed: true, retryAfterSec: 0 };
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.windowStart + this.windowMs - now) / 1000)) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) {
      if (now - v.windowStart >= this.windowMs) this.hits.delete(k);
    }
    if (this.hits.size >= this.maxKeys) this.hits.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Build + send                                                        */
/* ------------------------------------------------------------------ */

export type ServerEventContext = {
  nowMs: number;
  userAgent: string;
  clientIp?: string;
  fbp?: string;
  fbc?: string;
};

/** Builds the CAPI event. Fields with no real value are omitted — never null or "". */
export function buildServerEvent(input: RelayEvent, ctx: ServerEventContext): Record<string, unknown> {
  const userData: Record<string, string> = { client_user_agent: ctx.userAgent };
  if (ctx.clientIp) userData.client_ip_address = ctx.clientIp;
  if (ctx.fbp) userData.fbp = ctx.fbp;
  if (ctx.fbc) userData.fbc = ctx.fbc;

  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: Math.floor(ctx.nowMs / 1000),
    event_id: input.eventId,
    action_source: "website",
    event_source_url: input.eventSourceUrl,
    user_data: userData,
  };
  if (Object.keys(input.customData).length > 0) event.custom_data = input.customData;
  return event;
}

export type MetaErrorInfo = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
};

export type SendResult =
  | { ok: true; eventsReceived: number; fbtraceId?: string }
  | { ok: false; kind: "rejected"; status: number; error?: MetaErrorInfo }
  | { ok: false; kind: "timeout" }
  | { ok: false; kind: "network"; message: string }
  | { ok: false; kind: "bad_response"; status: number };

export async function sendEventsToMeta(
  events: Record<string, unknown>[],
  config: Pick<CapiConfig, "datasetId" | "accessToken" | "testEventCode">,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<SendResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  // Token goes in the POST body (as in Meta's curl examples), never in the URL, so it can't end up in URL logs.
  const form = new URLSearchParams();
  form.set("data", JSON.stringify(events));
  form.set("access_token", config.accessToken);
  if (config.testEventCode) form.set("test_event_code", config.testEventCode);

  let response: Response;
  try {
    response = await fetchImpl(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${config.datasetId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(opts.timeoutMs ?? META_CAPI_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, kind: "timeout" };
    return { ok: false, kind: "network", message: String((err as Error)?.message || err).slice(0, 200) };
  }

  let json: Record<string, unknown> | null = null;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }

  const metaError = json && isPlainObject(json.error) ? (json.error as MetaErrorInfo) : undefined;
  if (!response.ok || metaError) {
    if (!json) return { ok: false, kind: "bad_response", status: response.status };
    return { ok: false, kind: "rejected", status: response.status, error: metaError };
  }
  const received = typeof json?.events_received === "number" ? json.events_received : NaN;
  if (!Number.isFinite(received)) return { ok: false, kind: "bad_response", status: response.status };
  if (received < events.length) return { ok: false, kind: "rejected", status: response.status };
  return { ok: true, eventsReceived: received, fbtraceId: typeof json?.fbtrace_id === "string" ? json.fbtrace_id : undefined };
}

function redact(text: string | undefined, secret: string): string | undefined {
  if (!text) return text;
  const clipped = text.slice(0, 300);
  return secret ? clipped.split(secret).join("[redacted]") : clipped;
}

/** Logs Meta's error details server-side. Never logs the token, cookies, IP or user agent. */
export function logSendFailure(
  logger: Logger,
  result: Exclude<SendResult, { ok: true }>,
  ctx: { eventName: string; eventId: string; accessToken: string }
) {
  const base = `[meta-capi] ${ctx.eventName} event_id=${ctx.eventId}`;
  if (result.kind === "rejected") {
    const e = result.error || {};
    logger.error(
      `${base} rejected by Meta: http=${result.status} code=${e.code ?? "-"} subcode=${e.error_subcode ?? "-"} type=${
        e.type ?? "-"
      } fbtrace_id=${e.fbtrace_id ?? "-"} message=${JSON.stringify(redact(e.message, ctx.accessToken) ?? "")} user_msg=${JSON.stringify(
        redact(e.error_user_msg, ctx.accessToken) ?? ""
      )}`
    );
  } else if (result.kind === "timeout") {
    logger.error(`${base} timed out after ${META_CAPI_TIMEOUT_MS}ms`);
  } else if (result.kind === "network") {
    logger.error(`${base} network error: ${redact(result.message, ctx.accessToken)}`);
  } else {
    logger.error(`${base} unreadable response from Meta: http=${result.status}`);
  }
}

/* ------------------------------------------------------------------ */
/* Request handler (framework-agnostic, used by the Next.js route)     */
/* ------------------------------------------------------------------ */

export type RelayResponse = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

export type RelayDeps = {
  env?: Env;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  now?: () => number;
  ipLimiter?: FixedWindowRateLimiter;
  globalLimiter?: FixedWindowRateLimiter;
};

const defaultIpLimiter = new FixedWindowRateLimiter(120, 60_000);
const defaultGlobalLimiter = new FixedWindowRateLimiter(6000, 60_000);

/** Config warnings are logged at most once a minute so a missing env var can't flood PM2 logs. */
const lastLogged = new Map<string, number>();
function shouldLog(key: string, nowMs: number): boolean {
  const last = lastLogged.get(key);
  if (last !== undefined && nowMs - last < 60_000) return false;
  lastLogged.set(key, nowMs);
  return true;
}
export function resetLogThrottleForTests() {
  lastLogged.clear();
}

export async function handleRelayRequest(
  req: { headers: Headers; bodyText: string },
  deps: RelayDeps = {}
): Promise<RelayResponse> {
  const env = deps.env ?? (process.env as Env);
  const logger = deps.logger ?? console;
  const now = deps.now ?? Date.now;
  const ipLimiter = deps.ipLimiter ?? defaultIpLimiter;
  const globalLimiter = deps.globalLimiter ?? defaultGlobalLimiter;

  const cfg = readCapiConfig(env);
  if (!cfg.ok) {
    if (shouldLog("not_configured", now())) logger.error(`[meta-capi] not configured: ${cfg.reason}`);
    return { status: 503, body: { error: "capi_not_configured" } };
  }
  const config = cfg.config;
  if (config.testEventCode && shouldLog("test_code", now())) {
    logger.warn("[meta-capi] META_CAPI_TEST_EVENT_CODE is set — remove it after testing.");
  }

  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) return { status: 415, body: { error: "unsupported_media_type" } };

  if (Buffer.byteLength(req.bodyText, "utf8") > MAX_BODY_BYTES) return { status: 413, body: { error: "payload_too_large" } };

  if (!isAllowedOrigin(req.headers, config.allowedHosts, config.allowHttpLocalhost)) {
    return { status: 403, body: { error: "forbidden_origin" } };
  }

  const userAgent = (req.headers.get("user-agent") || "").trim();
  if (!userAgent || userAgent.length > 512) return { status: 400, body: { error: "invalid_user_agent" } };

  const nowMs = now();
  const clientIp = resolveClientIp(req.headers, config.clientIpHeader);
  const globalCheck = globalLimiter.check("global", nowMs);
  const ipCheck = clientIp ? ipLimiter.check(clientIp, nowMs) : { allowed: true, retryAfterSec: 0 };
  if (!globalCheck.allowed || !ipCheck.allowed) {
    const retry = Math.max(globalCheck.retryAfterSec, ipCheck.retryAfterSec);
    return { status: 429, body: { error: "rate_limited" }, headers: { "Retry-After": String(retry) } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(req.bodyText);
  } catch {
    return { status: 400, body: { error: "invalid_json" } };
  }

  const validated = validateRelayBody(parsed, {
    allowedHosts: config.allowedHosts,
    allowHttpLocalhost: config.allowHttpLocalhost,
  });
  if (!validated.ok) {
    if (shouldLog(`invalid:${validated.error}`, nowMs)) {
      logger.warn(`[meta-capi] rejected invalid payload (${validated.error}); further ones are logged at most once a minute`);
    }
    return { status: 400, body: { error: "invalid_payload", field: validated.error } };
  }

  const event = buildServerEvent(validated.value, {
    nowMs,
    userAgent,
    clientIp,
    ...resolveFbpFbc(req.headers.get("cookie"), validated.value.eventSourceUrl, nowMs),
  });

  const result = await sendEventsToMeta([event], config, { fetchImpl: deps.fetchImpl });
  if (result.ok) return { status: 200, body: { ok: true, eventsReceived: result.eventsReceived } };

  logSendFailure(logger, result, {
    eventName: validated.value.eventName,
    eventId: validated.value.eventId,
    accessToken: config.accessToken,
  });
  if (result.kind === "timeout") return { status: 504, body: { error: "meta_timeout" } };
  if (result.kind === "rejected") return { status: 502, body: { error: "meta_rejected" } };
  return { status: 502, body: { error: "meta_unreachable" } };
}
