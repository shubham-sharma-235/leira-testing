"use client";

import * as React from "react";
import {
  alignGa4ItemsToTransactionTotal,
  buildFallbackGa4Items,
  decodeGa4ItemsFromUrlParam,
  hasPurchaseBeenTracked,
  trackGa4Purchase,
} from "@/lib/analytics/ga4";
import type { Ga4PurchaseLineItem } from "@/lib/analytics/google";
import { claimMetaPurchaseOnce, trackMetaEvent } from "@/lib/analytics/metaPixel";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const isDev = process.env.NODE_ENV === "development";

/** Client/GTM URL params: ?order=&value=&qty=&ids= (+ optional ga4_items, orderId) */
function readThankYouUrlParams() {
  if (typeof window === "undefined") {
    return { order: "", value: 0, qty: 0, ids: "", ga4ItemsRaw: null as string | null, orderId: "" };
  }
  const params = new URLSearchParams(window.location.search);
  const valueRaw = params.get("value");
  const parsedValue = valueRaw ? parseFloat(String(valueRaw).replace(/[^0-9.]/g, "")) : 0;
  return {
    order: String(params.get("order") || "").trim(),
    value: Number.isFinite(parsedValue) ? parsedValue : 0,
    qty: Math.max(0, parseInt(String(params.get("qty") || "0"), 10) || 0),
    ids: String(params.get("ids") || "").trim(),
    ga4ItemsRaw: params.get("ga4_items"),
    orderId: String(params.get("orderId") || params.get("order_id") || "").trim(),
  };
}

function resolveLineItems(
  value: number,
  qty: number,
  idsCsv: string,
  contentIds: string[],
  ga4Items: Ga4PurchaseLineItem[]
): Ga4PurchaseLineItem[] {
  if (ga4Items.length > 0 && value > 0) {
    return alignGa4ItemsToTransactionTotal(ga4Items, value);
  }
  const idList =
    contentIds.length > 0
      ? contentIds
      : idsCsv
        ? idsCsv.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
  const numItems = qty > 0 ? qty : value > 0 ? 1 : 0;
  return buildFallbackGa4Items({ value, contentIds: idList, numItems });
}

/**
 * Browser Purchase. eventID must stay the order number so it matches the
 * backend CAPI Purchase event_id for Meta dedupe. Sent at most once per order
 * per browser (refreshes / reopened links are ignored) and never with value 0.
 */
function fireMetaPurchase(payload: {
  order: string;
  value: number;
  contentIds: string[];
  qty: number;
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
}): boolean {
  const { order, value, contentIds, qty, contents } = payload;
  if (!order || !(value > 0)) return false;
  if (!claimMetaPurchaseOnce(order)) return false;
  trackMetaEvent("Purchase", {
    currency: "INR",
    value,
    content_type: "product",
    ...(contentIds.length ? { content_ids: contentIds } : {}),
    ...(contents && contents.length ? { contents } : {}),
    ...(qty > 0 ? { num_items: qty } : {}),
    transaction_id: order,
    eventID: order,
  });
  return true;
}

function toMetaContents(items: Ga4PurchaseLineItem[]) {
  return items
    .map((it) => ({
      id: String(it.item_id || "").trim(),
      quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
      price: Number(it.price),
    }))
    .filter((it) => it.id)
    .map((it) => ({
      id: it.id,
      quantity: it.quantity,
      ...(Number.isFinite(it.price) && it.price > 0 ? { item_price: it.price } : {}),
    }));
}

function fireGtmPurchase(payload: {
  transactionId: string;
  value: number;
  items: Ga4PurchaseLineItem[];
  contentIds: string[];
  qty: number;
}): boolean {
  const { transactionId, value, items, contentIds, qty } = payload;
  if (!transactionId || value <= 0 || items.length === 0) return false;
  if (hasPurchaseBeenTracked(transactionId)) return false;

  const ok = trackGa4Purchase({
    transaction_id: transactionId,
    value,
    currency: "INR",
    tax: 0,
    shipping: 0,
    items,
  });

  if (isDev) {
    console.log(ok ? "PURCHASE PUSHED" : "PURCHASE skipped (dedupe or invalid)", {
      event: "purchase",
      transaction_id: transactionId,
      value,
      currency: "INR",
      items,
    });
  }

  return ok;
}

export type ThankYouPixelProps = {
  orderId?: string;
  orderNumber?: string;
  value?: number;
  contentIds?: string[];
  numItems?: number;
  ga4Items?: Ga4PurchaseLineItem[];
};

/** GTM purchase pixel — reads ?order=&value=&qty=&ids= from URL (client flow) + optional props from page. */
export default function ThankYouPixel({
  orderId: orderIdProp,
  orderNumber,
  value: valueProp = 0,
  contentIds = [],
  numItems = 0,
  ga4Items = [],
}: ThankYouPixelProps = {}) {
  const metaFiredRef = React.useRef(false);

  React.useEffect(() => {
    const fromUrl = readThankYouUrlParams();

    const order = fromUrl.order || String(orderNumber || "").trim();
    const value = fromUrl.value > 0 ? fromUrl.value : Number(valueProp) || 0;
    const qty = fromUrl.qty > 0 ? fromUrl.qty : Number(numItems) || (value > 0 ? 1 : 0);
    const idsCsv = fromUrl.ids || contentIds.join(",");
    const mergedContentIds = idsCsv
      ? idsCsv.split(",").map((s) => s.trim()).filter(Boolean)
      : contentIds;

    const decodedFromUrl = fromUrl.ga4ItemsRaw
      ? decodeGa4ItemsFromUrlParam(fromUrl.ga4ItemsRaw)
      : null;
    const mergedGa4Items =
      decodedFromUrl && decodedFromUrl.length > 0 ? decodedFromUrl : ga4Items;

    if (isDev) {
      console.log("THANK YOU PIXEL RUNNING", {
        order,
        value,
        qty,
        ids: idsCsv,
        ga4ItemsCount: mergedGa4Items.length,
      });
    }

    // No value in the URL → wait for the order fetched from the backend below.
    if (!metaFiredRef.current && order && value > 0) {
      metaFiredRef.current = true;
      fireMetaPurchase({
        order,
        value,
        contentIds: mergedContentIds,
        qty,
        // Only real line items from the URL — never the synthetic fallback items.
        contents: decodedFromUrl && decodedFromUrl.length > 0 ? toMetaContents(decodedFromUrl) : undefined,
      });
    }

    if (order && value > 0) {
      const items = resolveLineItems(value, qty, idsCsv, mergedContentIds, mergedGa4Items);
      fireGtmPurchase({
        transactionId: order,
        value,
        items,
        contentIds: mergedContentIds,
        qty,
      });
    }
  }, [orderNumber, valueProp, contentIds, numItems, ga4Items]);

  React.useEffect(() => {
    const orderId = readThankYouUrlParams().orderId || String(orderIdProp || "").trim();
    if (!orderId) return;

    const fromUrl = readThankYouUrlParams();
    const order = fromUrl.order || String(orderNumber || "").trim();
    const value = fromUrl.value > 0 ? fromUrl.value : Number(valueProp) || 0;
    if (order && value > 0 && hasPurchaseBeenTracked(order)) return;

    let cancelled = false;
    void (async () => {
      try {
        const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api").replace(
          /\/+$/,
          ""
        );
        const res = await fetch(`${apiBase}/orders/my/${encodeURIComponent(orderId)}`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { data?: Record<string, unknown> };
        const orderData = json?.data;
        if (!orderData || cancelled) return;

        const on = String(orderData.orderNumber || orderData._id || "").trim();
        const total = Number(orderData.total);
        const safeTotal = Number.isFinite(total) ? total : 0;
        if (!on || safeTotal <= 0) return;

        const lines: Ga4PurchaseLineItem[] = Array.isArray(orderData.items)
          ? (orderData.items as Record<string, unknown>[])
              .map((it) => ({
                item_id: String(
                  (it?.product as { _id?: string })?._id || it?.product || it?._id || ""
                ),
                item_name: String(
                  it?.name || (it?.product as { name?: string })?.name || "Product"
                ),
                price: Number(it?.price),
                quantity: Math.max(1, Math.floor(Number(it?.quantity) || 1)),
              }))
              .filter(
                (it) =>
                  Boolean(it.item_id) &&
                  Number.isFinite(Number(it.price)) &&
                  Number(it.quantity) > 0
              )
          : [];
        const ids = lines.map((l) => l.item_id).filter(Boolean);
        const qty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0) || 1;
        const items = resolveLineItems(safeTotal, qty, ids.join(","), ids, lines);

        if (!metaFiredRef.current) {
          metaFiredRef.current = true;
          fireMetaPurchase({ order: on, value: safeTotal, contentIds: ids, qty, contents: toMetaContents(lines) });
        }

        fireGtmPurchase({
          transactionId: on,
          value: safeTotal,
          items,
          contentIds: ids,
          qty,
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderIdProp, orderNumber, valueProp]);

  return null;
}
