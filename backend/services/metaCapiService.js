/**
 * Meta Conversions API (CAPI) — server-side events.
 * Works with browser Pixel; same event_id = Meta dedupes.
 *
 * Env:
 *   META_CAPI_ENABLED=true
 *   META_PIXEL_ID=2246501689158730
 *   META_CAPI_ACCESS_TOKEN=...
 *   META_CAPI_API_VERSION=v21.0
 *   META_EVENT_SOURCE_URL=https://leiraindia.com/thank-you
 *   META_CAPI_TEST_EVENT_CODE=  (optional, Events Manager Test Events)
 */
const crypto = require('crypto');
const Order = require('../models/Order');

function getConfig() {
  const enabled =
    String(process.env.META_CAPI_ENABLED ?? 'true').toLowerCase() !== 'false';
  const pixelId = String(
    process.env.META_PIXEL_ID || process.env.META_CAPI_PIXEL_ID || '2246501689158730'
  ).trim();
  const accessToken = String(process.env.META_CAPI_ACCESS_TOKEN || '').trim();
  const apiVersion = String(process.env.META_CAPI_API_VERSION || 'v21.0').trim();
  const eventSourceUrl = String(
    process.env.META_EVENT_SOURCE_URL || 'https://leiraindia.com/thank-you'
  ).trim();
  const testEventCode = String(process.env.META_CAPI_TEST_EVENT_CODE || '').trim();
  const timeoutMs = Math.max(
    3000,
    Number(process.env.META_CAPI_TIMEOUT_MS || 15000)
  );

  return {
    enabled,
    pixelId,
    accessToken,
    apiVersion,
    eventSourceUrl,
    testEventCode,
    timeoutMs,
    configured: Boolean(enabled && pixelId && accessToken),
  };
}

function sha256Normalized(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Digits only; keep leading country code if present (India → 91…). */
function normalizePhoneForHash(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

function firstForwardedIp(req) {
  const xf = req?.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  return (
    String(req?.ip || req?.socket?.remoteAddress || '')
      .replace(/^::ffff:/, '')
      .trim() || undefined
  );
}

function buildUserData(order, { clientIp, userAgent, fbp, fbc } = {}) {
  const email = String(order?.customer?.email || '').trim();
  const phone = normalizePhoneForHash(
    order?.customer?.phone || order?.shippingAddress?.phone || ''
  );
  const firstName = String(order?.customer?.name || '')
    .trim()
    .split(/\s+/)[0];
  const city = String(order?.shippingAddress?.city || '').trim();
  const state = String(order?.shippingAddress?.state || '').trim();
  const zip = String(order?.shippingAddress?.pincode || '').trim();
  const country = 'in';

  const userData = {};
  const em = sha256Normalized(email);
  const ph = phone ? sha256Normalized(phone) : null;
  const fn = firstName ? sha256Normalized(firstName) : null;
  const ct = city ? sha256Normalized(city) : null;
  const st = state ? sha256Normalized(state) : null;
  const zp = zip ? sha256Normalized(zip) : null;
  const countryHash = sha256Normalized(country);

  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (fn) userData.fn = [fn];
  if (ct) userData.ct = [ct];
  if (st) userData.st = [st];
  if (zp) userData.zp = [zp];
  if (countryHash) userData.country = [countryHash];
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = String(userAgent).slice(0, 512);
  if (fbp) userData.fbp = String(fbp);
  if (fbc) userData.fbc = String(fbc);

  return userData;
}

function buildPurchaseCustomData(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const contentIds = items
    .map((it) => String(it?.product?._id || it?.product || '').trim())
    .filter(Boolean);
  const numItems = items.reduce((sum, it) => sum + Math.max(1, Number(it?.quantity) || 1), 0);
  const value = Number(order?.total);
  const orderRef = String(order?.orderNumber || order?._id || '').trim();

  return {
    currency: 'INR',
    value: Number.isFinite(value) ? value : 0,
    content_type: 'product',
    ...(contentIds.length ? { content_ids: contentIds } : {}),
    ...(numItems > 0 ? { num_items: numItems } : {}),
    ...(orderRef ? { order_id: orderRef } : {}),
  };
}

async function sendCapiEvents(events, cfg) {
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${encodeURIComponent(
    cfg.pixelId
  )}/events`;

  const body = {
    data: events,
    access_token: cfg.accessToken,
  };
  if (cfg.testEventCode) {
    body.test_event_code = cfg.testEventCode;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg =
        data?.error?.message ||
        data?.error?.error_user_msg ||
        `Meta CAPI HTTP ${response.status}`;
      const err = new Error(msg);
      err.code = 'META_CAPI_HTTP_ERROR';
      err.details = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort Purchase via CAPI. Never throws to callers.
 * event_id = orderNumber (must match browser Pixel eventID).
 */
async function attemptMetaPurchaseCapi(order, opts = {}) {
  const cfg = getConfig();
  if (!cfg.configured) {
    return { sent: false, skipped: true, reason: 'Meta CAPI not configured' };
  }
  if (!order?._id) {
    return { sent: false, skipped: true, reason: 'No order' };
  }
  if (order.status === 'cancelled') {
    return { sent: false, skipped: true, reason: 'Order cancelled' };
  }

  const force = Boolean(opts.force);
  if (!force && order?.metaCapiPurchase?.status === 'sent') {
    return { sent: false, skipped: true, reason: 'Already sent' };
  }

  const eventId = String(order.orderNumber || order._id).trim();
  if (!eventId) {
    return { sent: false, skipped: true, reason: 'No event id' };
  }

  const claimFilter = {
    _id: order._id,
    ...(force ? {} : { 'metaCapiPurchase.status': { $ne: 'sent' } }),
  };

  const claimed = await Order.findOneAndUpdate(
    claimFilter,
    {
      $set: {
        'metaCapiPurchase.status': 'pending',
        'metaCapiPurchase.lastAttemptAt': new Date(),
        'metaCapiPurchase.lastError': '',
        'metaCapiPurchase.eventId': eventId,
      },
      $inc: { 'metaCapiPurchase.attempts': 1 },
    },
    { new: true }
  );

  if (!claimed) {
    return { sent: false, skipped: true, reason: 'Already sent or in progress' };
  }

  const clientIp = opts.clientIp || firstForwardedIp(opts.req);
  const userAgent =
    opts.userAgent || opts.req?.headers?.['user-agent'] || undefined;

  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    event_source_url: cfg.eventSourceUrl,
    action_source: 'website',
    user_data: buildUserData(claimed, {
      clientIp,
      userAgent,
      fbp: opts.fbp,
      fbc: opts.fbc,
    }),
    custom_data: buildPurchaseCustomData(claimed),
  };

  try {
    const result = await sendCapiEvents([event], cfg);

    await Order.findByIdAndUpdate(claimed._id, {
      $set: {
        'metaCapiPurchase.status': 'sent',
        'metaCapiPurchase.sentAt': new Date(),
        'metaCapiPurchase.lastError': '',
        'metaCapiPurchase.eventId': eventId,
        'metaCapiPurchase.fbTraceId': String(
          result?.fbtrace_id || result?.events_received || ''
        ),
      },
    });

    return { sent: true, skipped: false, eventId, result };
  } catch (error) {
    const message =
      error?.name === 'AbortError'
        ? 'Meta CAPI request timed out'
        : error?.message || 'Meta CAPI Purchase failed';

    await Order.findByIdAndUpdate(claimed._id, {
      $set: {
        'metaCapiPurchase.status': 'failed',
        'metaCapiPurchase.lastError': String(message).slice(0, 500),
        'metaCapiPurchase.eventId': eventId,
      },
    });

    console.error('[Meta CAPI] Purchase failed:', message);
    return { sent: false, skipped: false, error: message };
  }
}

module.exports = {
  getConfig,
  attemptMetaPurchaseCapi,
  buildUserData,
  buildPurchaseCustomData,
};
