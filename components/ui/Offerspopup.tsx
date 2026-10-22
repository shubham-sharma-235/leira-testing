"use client";

import React, { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------
   LEIRA — OFFERS POPUP (minimal / premium)

   Fades in 6s after load, presents the current offers, then quiets down
   (once per session). Clean sans-serif throughout, generous whitespace,
   one clear call to action.

   - Closes on X, backdrop, Esc, "Maybe later".
   - Does NOT touch body/html overflow (stays clear of the hero audit).
   - No injected @keyframes; fade is inline state.
------------------------------------------------------------------- */

type Offer = { highlight: string; text: string };

const OFFERS: Offer[] = [
  {
    highlight: "Up to 45% OFF",
    text: "Big Billion Offer on your favourites.",
  },
  {
    highlight: "5% OFF prepaid",
    text: "Pay online for an instant discount.",
  },
  {
    highlight: "Extra 5% OFF",
    text: "Just comment on your order to unlock it.",
  },
  {
    highlight: "Free delivery",
    text: "On every order above ₹2,000.",
  },
];

const DELAY_MS = 5000;
const FADE_MS = 400;
const SESSION_KEY = "leira_offers_popup_shown";
const SHOP_HREF = "/shop";

const SANS = '"Jost", system-ui, -apple-system, sans-serif';

const INK = "#3f2430";
const MUTED = "#8a7480";
const PINK = "#d14d86";
const LINE = "rgba(63, 36, 48, 0.08)";

export default function OffersPopup() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    let shown = false;
    try {
      shown = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      shown = false;
    }
    if (shown) return;

    const t = window.setTimeout(() => {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* no-op */
      }
    }, DELAY_MS);

    return () => window.clearTimeout(t);
  }, []);

  const handleClose = () => {
    setOpen(false);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMounted(false), FADE_MS);
  };

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    []
  );

  if (!mounted) return null;

  let reduce = false;
  try {
    reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    reduce = false;
  }
  const trans = reduce ? "none" : `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Leira offers"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: SANS,
        background: open ? "rgba(43, 15, 29, 0.42)" : "rgba(43, 15, 29, 0)",
        backdropFilter: open ? "blur(4px)" : "blur(0px)",
        WebkitBackdropFilter: open ? "blur(4px)" : "blur(0px)",
        transition: trans,
        overscrollBehavior: "contain",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(420px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 16,
          padding: "clamp(30px, 6vw, 44px) clamp(26px, 5vw, 40px)",
          background: "#ffffff",
          boxShadow: "0 24px 70px -20px rgba(63, 36, 48, 0.45)",
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(12px)",
          transition: trans,
        }}
      >
        {/* close */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            background: "transparent",
            color: MUTED,
            fontSize: 20,
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "color 160ms ease",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = INK)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = MUTED)}
        >
          ×
        </button>

        {/* eyebrow */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: PINK,
            marginBottom: 14,
          }}
        >
          Offers
        </div>

        {/* title */}
        <h2
          style={{
            margin: 0,
            fontSize: "clamp(22px, 5.5vw, 26px)",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: INK,
            lineHeight: 1.2,
          }}
        >
          A little something for you
        </h2>
        <p
          style={{
            margin: "8px 0 clamp(22px, 5vw, 28px)",
            fontSize: 14,
            fontWeight: 300,
            lineHeight: 1.5,
            color: MUTED,
          }}
        >
          Enjoy these limited-time savings on your order.
        </p>

        {/* offers list */}
        <div>
          {OFFERS.map((o, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 16,
                padding: "14px 0",
                borderTop: i === 0 ? `1px solid ${LINE}` : `1px solid ${LINE}`,
                ...(i === OFFERS.length - 1 ? { borderBottom: `1px solid ${LINE}` } : {}),
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 300,
                  color: MUTED,
                  lineHeight: 1.4,
                }}
              >
                {o.text}
              </span>
              <span
                style={{
                  flex: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  color: INK,
                  whiteSpace: "nowrap",
                }}
              >
                {o.highlight}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <a
          href={SHOP_HREF}
          onClick={handleClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "clamp(24px, 5vw, 30px)",
            padding: "15px 24px",
            borderRadius: 999,
            background: INK,
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textDecoration: "none",
            transition: "background 180ms ease",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = PINK)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = INK)}
        >
          Shop now
        </a>

        <button
          type="button"
          onClick={handleClose}
          style={{
            display: "block",
            width: "100%",
            margin: "14px 0 0",
            padding: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12.5,
            fontWeight: 300,
            color: MUTED,
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   HOW TO MOUNT

     import OffersPopup from "@/components/ui/OffersPopup";
     ...
     <Hero />
     <OffersMarquee />
     <OffersPopup />

   Timing:    DELAY_MS (6000 = 6s).
   Frequency: once per session. Delete SESSION_KEY logic to show always;
              swap sessionStorage -> localStorage to show once ever.
   CTA link:  SHOP_HREF.
------------------------------------------------------------------- */