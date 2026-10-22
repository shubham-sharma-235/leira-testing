/**
 * Meta Pixel — base code loads directly on the site (PublicOnlyAnalytics).
 *
 * Pixel ID: 2246501689158730 (a second Pixel, 2104905527043591, is initialised
 * alongside it in PublicOnlyAnalytics; fbq('track') reaches both).
 *
 * Deduplication: every browser event gets ONE event ID (createMetaEventId or
 * the order number for Purchase). The same ID goes to fbq as { eventID } and,
 * for relayed events, to the server CAPI route as event_id.
 *
 * Avoid a second Meta Pixel PageView tag in GTM on All Pages, or you will double-count.
 */

export const META_PIXEL_ID = "2246501689158730";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

type MetaEventParams = Record<string, unknown>;

const FBQ_BRIDGE_ENABLED =
  String(process.env.NEXT_PUBLIC_META_FBQ_BRIDGE ?? "true").toLowerCase() !== "false";

/**
 * Events that are also sent server-side through the CAPI route.
 * Purchase is intentionally absent: the server copy of Purchase must come from
 * the backend after payment verification, never from the browser.
 * Keep in sync with RELAY_EVENT_NAMES in lib/analytics/metaCapi.server.ts.
 */
export const META_RELAY_EVENTS = [
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "AddPaymentInfo",
  "AddToWishlist",
  "Contact",
] as const;
export type MetaRelayEventName = (typeof META_RELAY_EVENTS)[number];

/** Same-origin path of the CAPI route. Empty = server relay off (browser Pixel only). */
function getCapiPath(): string {
  const path = String(process.env.NEXT_PUBLIC_META_CAPI_PATH || "").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "";
}

function randomToken(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * One fresh ID per user action, e.g. "addtocart.3f1c…". Generate it once and
 * pass that same value to the Pixel and the server — never generate twice.
 */
export function createMetaEventId(eventName: string): string {
  const prefix =
    String(eventName || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 24) || "event";
  return `${prefix}.${randomToken()}`;
}

/** Wait until Pixel base code has defined window.fbq */
export function whenFbqReady(run: () => void, timeoutMs = 8000): void {
  if (typeof window === "undefined") return;
  const start = Date.now();
  const poll = () => {
    if (typeof window.fbq === "function") {
      run();
      return;
    }
    if (Date.now() - start >= timeoutMs) {
      run();
      return;
    }
    window.setTimeout(poll, 50);
  };
  poll();
}

function pushMetaDataLayer(eventName: string, params: MetaEventParams, eventID: string) {
  window.dataLayer = window.dataLayer || [];
  const safeParams = { ...params };
  window.dataLayer.push({
    event: `meta_${eventName}`,
    meta_event_name: eventName,
    meta_event_id: eventID,
    meta_event_params: safeParams,
    meta_pixel_id: META_PIXEL_ID,
    ...safeParams,
  });
}

function splitEventId(params?: MetaEventParams): {
  eventID?: string;
  custom: MetaEventParams;
} {
  if (!params || typeof params !== "object") return { custom: {} };
  const raw = params.eventID ?? params.event_id;
  const eventID = raw != null && String(raw).trim() ? String(raw).trim() : undefined;
  const custom = { ...params };
  delete custom.eventID;
  delete custom.event_id;
  return { eventID, custom };
}

function fireFbq(eventName: string, params?: MetaEventParams) {
  if (typeof window.fbq !== "function") return;
  try {
    const { eventID, custom } = splitEventId(params);
    const hasCustom = Object.keys(custom).length > 0;
    if (eventID) {
      if (hasCustom) {
        window.fbq("track", eventName, custom, { eventID });
      } else {
        window.fbq("track", eventName, {}, { eventID });
      }
      return;
    }
    if (hasCustom) {
      window.fbq("track", eventName, custom);
      return;
    }
    window.fbq("track", eventName);
  } catch {
    // Never block UX
  }
}

/**
 * Meta standard events → dataLayer + fbq.
 * Uses params.eventID when given (Purchase passes the order number);
 * otherwise creates one. Returns the event ID that was used.
 */
export function trackMetaEvent(eventName: string, params?: MetaEventParams): string | undefined {
  if (typeof window === "undefined") return undefined;
  const name = String(eventName || "").trim();
  if (!name) return undefined;

  const { eventID: provided, custom } = splitEventId(params);
  const eventID = provided || createMetaEventId(name);
  const withId: MetaEventParams = { ...custom, eventID };

  try {
    pushMetaDataLayer(name, withId, eventID);
  } catch {
    /* ignore */
  }

  if (FBQ_BRIDGE_ENABLED) {
    whenFbqReady(() => {
      fireFbq(name, withId);
    });
  }
  return eventID;
}

const RELAY_CUSTOM_KEYS = [
  "value",
  "currency",
  "content_ids",
  "content_type",
  "content_name",
  "contents",
  "num_items",
] as const;

function pickRelayCustomData(custom: MetaEventParams): MetaEventParams {
  const out: MetaEventParams = {};
  for (const key of RELAY_CUSTOM_KEYS) {
    const v = custom[key];
    if (v !== undefined && v !== null && v !== "") out[key] = v;
  }
  return out;
}

/**
 * Sends the server copy of a browser event to the CAPI route, reusing the
 * browser's event ID. Fire-and-forget: never throws, never blocks the UI.
 * No-op for Purchase, on the server, or when NEXT_PUBLIC_META_CAPI_PATH is unset.
 */
export function sendMetaServerEvent(
  eventName: MetaRelayEventName,
  eventId: string,
  customData: MetaEventParams = {}
): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  if (!(META_RELAY_EVENTS as readonly string[]).includes(eventName)) return;
  const path = getCapiPath();
  if (!path || !eventId) return;
  try {
    const { origin, pathname, search } = window.location;
    const body = JSON.stringify({
      eventName,
      eventId,
      eventSourceUrl: `${origin}${pathname}${search}`,
      customData: pickRelayCustomData(customData),
    });
    void fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* never block UX */
  }
}

/** Browser Pixel event + server CAPI copy with the same event ID. Returns that ID. */
export function trackMetaEventWithCapi(
  eventName: MetaRelayEventName,
  params?: MetaEventParams
): string | undefined {
  const eventID = trackMetaEvent(eventName, params);
  if (!eventID) return undefined;
  sendMetaServerEvent(eventName, eventID, splitEventId(params).custom);
  return eventID;
}

/** SPA / soft navigations */
export function trackMetaVirtualPageView(
  pathname: string,
  options?: { fireFbqPageView?: boolean }
) {
  if (typeof window === "undefined") return;
  const path = String(pathname || "").trim() || "/";
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "virtual_page_view",
      page_path: path,
      page_location: window.location.href,
      page_title: typeof document !== "undefined" ? document.title : "",
      meta_pixel_id: META_PIXEL_ID,
    });
  } catch {
    /* ignore */
  }

  if (!FBQ_BRIDGE_ENABLED || options?.fireFbqPageView === false) return;
  whenFbqReady(() => {
    fireFbq("PageView");
  });
}

/**
 * "₹2,399" → 2399, "Rs. 1,299.50" → 1299.5. Returns 0 when no price is present.
 * (The previous version turned "Rs. 1,299" into 0.1299 because it kept the dot after "Rs".)
 */
export function parseInrPrice(value: string | number | undefined | null): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const match = String(value).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return 0;
  const parsed = parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Product-level params (ViewContent / AddToCart / AddToWishlist). Omits anything unknown instead of inventing it. */
export function buildMetaProductParams(input: {
  id: string;
  name?: string | null;
  unitPrice?: number;
  quantity?: number;
}): MetaEventParams {
  const id = String(input.id || "").trim();
  if (!id) return {};
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const unitPrice = Number(input.unitPrice);
  const hasPrice = Number.isFinite(unitPrice) && unitPrice > 0;
  const name = String(input.name || "").trim().slice(0, 200);
  return {
    content_ids: [id],
    content_type: "product",
    ...(name ? { content_name: name } : {}),
    contents: [{ id, quantity, ...(hasPrice ? { item_price: roundMoney(unitPrice) } : {}) }],
    ...(hasPrice ? { value: roundMoney(unitPrice * quantity), currency: "INR" } : {}),
  };
}

/** Cart-level params (InitiateCheckout / AddPaymentInfo). */
export function buildMetaCartParams(
  items: Array<{ id: string; quantity: number; price: number }>,
  total: number
): MetaEventParams {
  const lines = items
    .map((it) => ({
      id: String(it.id || "").trim(),
      quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
      price: Number(it.price),
    }))
    .filter((it) => it.id);
  const value = Number(total);
  const priced = Number.isFinite(value) && value > 0 ? { value: roundMoney(value), currency: "INR" } : {};
  if (lines.length === 0) return priced;
  return {
    content_ids: Array.from(new Set(lines.map((l) => l.id))),
    content_type: "product",
    contents: lines.map((l) => ({
      id: l.id,
      quantity: l.quantity,
      ...(Number.isFinite(l.price) && l.price > 0 ? { item_price: roundMoney(l.price) } : {}),
    })),
    num_items: lines.reduce((s, l) => s + l.quantity, 0),
    ...priced,
  };
}

/* ------------------------------------------------------------------ */
/* Purchase: fire once per order per browser                            */
/* ------------------------------------------------------------------ */

const PURCHASE_GUARD_KEY = "leira_meta_purchase_sent";
const PURCHASE_GUARD_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const PURCHASE_GUARD_MAX = 50;
const claimedThisPage = new Set<string>();

/**
 * Returns true the first time it is called for an order on this browser and
 * false afterwards — including after a refresh or reopening the thank-you
 * link — so the browser Purchase for an order is sent only once.
 */
export function claimMetaPurchaseOnce(orderKey: string, nowMs: number = Date.now()): boolean {
  const key = String(orderKey || "").trim();
  if (!key || typeof window === "undefined") return false;
  if (claimedThisPage.has(key)) return false;

  let stored: Record<string, number> = {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PURCHASE_GUARD_KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed as Record<string, number>;
  } catch {
    /* storage blocked or corrupt — fall back to this page only */
  }

  claimedThisPage.add(key);
  if (typeof stored[key] === "number") return false;

  const kept = Object.entries(stored)
    .filter(([, t]) => typeof t === "number" && nowMs - t < PURCHASE_GUARD_TTL_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, PURCHASE_GUARD_MAX - 1);
  const next = Object.fromEntries([[key, nowMs], ...kept]);
  try {
    window.localStorage.setItem(PURCHASE_GUARD_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return true;
}
