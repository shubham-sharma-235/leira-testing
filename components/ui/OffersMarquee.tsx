"use client";

import React, { useEffect, useRef } from "react";

/* ------------------------------------------------------------------
   LEIRA — OFFERS MARQUEE (rAF-driven, drag-enabled, plum band)

   Place below the hero, above the About section.

   WHY IT CAN LOOK FROZEN ONLY INSIDE THE NEXT APP:
   - CSS @keyframes injected via dangerouslySetInnerHTML get stripped →
     fixed by driving scroll with requestAnimationFrame + inline transform.
   - Fonts / the hero above push layout AFTER mount, so the first width
     measurement can be 0 and a naive wrap pins the offset → fixed below:
     the loop keeps re-acquiring the width every frame and NEVER pins to 0.

   - Seamless infinite loop (content duplicated, wraps at one track's width)
   - Auto-scroll; pauses on hover
   - Drag / swipe to scrub (mouse + touch), then auto-resumes
   - Highlighted deal in pink Cormorant; supporting line in blush
   - Plum band (lighter than the dark About section) + soft edge fades
   - Honours prefers-reduced-motion; no deps, no injected keyframes
------------------------------------------------------------------- */

type Offer = { highlight: string; text: string };

const OFFERS: Offer[] = [
  {
    highlight: "BIG BILLION OFFER — UP TO 45% OFF",
    text: "Shop your favourites and enjoy savings of up to 45% OFF.",
  },
  {
    highlight: "5% OFF on Prepaid Orders",
    text: "Pay online and get an instant 5% OFF.",
  },
  {
    highlight: "Extra 5% OFF — Just Comment!",
    text: "Comment on your order and unlock an additional 5% OFF.",
  },
  {
    highlight: "FREE Delivery on Orders ₹2,000+",
    text: "Enjoy free delivery when you spend ₹2,000 or more.",
  },
];

/** Pixels per second the rail drifts. Lower = slower. */
const SPEED = 60;

const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '"Jost", system-ui, sans-serif';

/* plum band — lighter than before (and much lighter than the About hero) */
const BAND_FROM = "#6b2a44";
const BAND_MID = "#5a2238";
const BAND_TO = "#6b2a44";
const EDGE_FADE = "#5a2238"; // edge fades blend into the band

function Drop() {
  return (
    <span
      aria-hidden="true"
      style={{
        flex: "none",
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50% 50% 50% 0",
        transform: "rotate(-45deg)",
        background: "linear-gradient(150deg, #f9a8d4, #ec4899)",
        boxShadow: "0 0 0 4px rgba(236, 72, 153, 0.16)",
      }}
    />
  );
}

function OfferItem({ offer }: { offer: Offer }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "10px", whiteSpace: "nowrap" }}>
      <span
        style={{
          fontFamily: SERIF,
          fontWeight: 600,
          fontStyle: "italic",
          fontSize: "clamp(16px, 1.7vw, 20px)",
          letterSpacing: "0.005em",
          color: "#fbcfe3",
        }}
      >
        {offer.highlight}
      </span>
      <span
        style={{
          fontFamily: SANS,
          fontWeight: 300,
          fontSize: "clamp(12.5px, 1.1vw, 14px)",
          letterSpacing: "0.01em",
          color: "rgba(253, 241, 245, 0.78)",
        }}
      >
        {offer.text}
      </span>
    </span>
  );
}

/** One full pass of all offers, separated by drops. */
function Track({
  innerRef,
  ariaHidden = false,
}: {
  innerRef?: React.Ref<HTMLDivElement>;
  ariaHidden?: boolean;
}) {
  return (
    <div
      ref={innerRef}
      aria-hidden={ariaHidden || undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "clamp(26px, 4vw, 52px)",
        paddingRight: "clamp(26px, 4vw, 52px)",
        flex: "none",
      }}
    >
      {OFFERS.map((offer, i) => (
        <span
          key={i}
          style={{ display: "inline-flex", alignItems: "center", gap: "clamp(26px, 4vw, 52px)" }}
        >
          <OfferItem offer={offer} />
          <Drop />
        </span>
      ))}
    </div>
  );
}

export default function OffersMarquee() {
  const railRef = useRef<HTMLDivElement | null>(null);
  const firstTrackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    const firstTrack = firstTrackRef.current;
    if (!rail || !firstTrack) return;

    let reduce = false;
    try {
      reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    } catch {
      reduce = false;
    }

    let offset = 0;
    let last = performance.now();
    let paused = false;
    let dragging = false;
    let dragStartX = 0;
    let dragStartOffset = 0;
    let raf = 0;

    // Cache the last known good width. We re-read it each frame, but if the
    // live read is 0 (layout not settled) we keep moving using the cache,
    // so the marquee NEVER freezes waiting for a measurement.
    let cachedWidth = 0;

    const liveWidth = () => firstTrack.getBoundingClientRect().width;

    const currentWidth = () => {
      const w = liveWidth();
      if (w > 1) cachedWidth = w;
      return cachedWidth; // may be 0 only on the very first frames
    };

    // Keep offset inside (-w, 0]. If we don't have a width yet, just let the
    // offset grow negative; it'll get wrapped correctly once width arrives.
    const wrap = (x: number) => {
      const w = currentWidth();
      if (w <= 1) return x;
      let v = x % w;
      if (v > 0) v -= w;
      return v;
    };

    const apply = () => {
      rail.style.transform = `translate3d(${offset}px, 0, 0)`;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused && !dragging && !reduce) {
        offset = wrap(offset - SPEED * dt);
        apply();
      }
      raf = requestAnimationFrame(tick);
    };

    const onEnter = () => { paused = true; };
    const onLeave = () => { paused = false; };

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      dragStartX = e.clientX;
      dragStartOffset = offset;
      rail.setPointerCapture?.(e.pointerId);
      rail.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      offset = wrap(dragStartOffset + (e.clientX - dragStartX));
      apply();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      rail.releasePointerCapture?.(e.pointerId);
      rail.style.cursor = "grab";
      last = performance.now();
    };

    rail.style.cursor = "grab";
    const host = rail.parentElement || rail;
    host.addEventListener("mouseenter", onEnter);
    host.addEventListener("mouseleave", onLeave);
    rail.addEventListener("pointerdown", onPointerDown);
    rail.addEventListener("pointermove", onPointerMove);
    rail.addEventListener("pointerup", onPointerUp);
    rail.addEventListener("pointercancel", onPointerUp);

    apply();
    raf = requestAnimationFrame(tick);

    // Prime the width cache once layout + fonts settle. Even if these never
    // fire, the per-frame liveWidth() read will pick the width up on its own.
    const prime = () => { currentWidth(); };
    const timers: number[] = [];
    [0, 150, 400, 900, 1800, 3000].forEach((ms) => {
      timers.push(window.setTimeout(prime, ms));
    });
    try {
      // @ts-ignore - document.fonts may be undefined in old browsers
      document.fonts?.ready?.then(prime);
    } catch {
      /* no-op */
    }

    const ro = new ResizeObserver(() => { currentWidth(); offset = wrap(offset); apply(); });
    ro.observe(firstTrack);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => clearTimeout(t));
      host.removeEventListener("mouseenter", onEnter);
      host.removeEventListener("mouseleave", onLeave);
      rail.removeEventListener("pointerdown", onPointerDown);
      rail.removeEventListener("pointermove", onPointerMove);
      rail.removeEventListener("pointerup", onPointerUp);
      rail.removeEventListener("pointercancel", onPointerUp);
      ro.disconnect();
    };
  }, []);

  return (
    <section
      aria-label="Current offers"
      style={{
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(180deg, ${BAND_FROM} 0%, ${BAND_MID} 50%, ${BAND_TO} 100%)`,
        borderTop: "1px solid rgba(216, 176, 106, 0.3)",
        borderBottom: "1px solid rgba(216, 176, 106, 0.3)",
        padding: "clamp(14px, 1.8vw, 20px) 0",
      }}
    >
      {/* soft centre glow */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(60% 120% at 50% 50%, rgba(249,168,212,0.14), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* edge fades — blend into the plum band */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: "clamp(40px, 8vw, 110px)",
          zIndex: 2,
          pointerEvents: "none",
          background: `linear-gradient(90deg, ${EDGE_FADE} 0%, rgba(90,34,56,0) 100%)`,
        }}
      />
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: "clamp(40px, 8vw, 110px)",
          zIndex: 2,
          pointerEvents: "none",
          background: `linear-gradient(270deg, ${EDGE_FADE} 0%, rgba(90,34,56,0) 100%)`,
        }}
      />

      {/* viewport (pause-on-hover is bound to this) */}
      <div style={{ position: "relative", width: "100%", overflow: "hidden" }}>
        <div
          ref={railRef}
          style={{
            display: "flex",
            width: "max-content",
            willChange: "transform",
            userSelect: "none",
            touchAction: "pan-y",
          }}
        >
          <Track innerRef={firstTrackRef} />
          <Track ariaHidden />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   HOW TO MOUNT

     import OffersMarquee from "@/components/ui/OffersMarquee";
     ...
     <Hero />
     <OffersMarquee />

   Speed:  SPEED (px/sec) near the top. Higher = faster.
   Colour: BAND_FROM / BAND_MID / BAND_TO near the top.
           Lighter → move toward #7a3450 ; darker → toward #3a1626.
------------------------------------------------------------------- */