"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type VideoItem = {
  _id?: string;
  id?: string;
  title?: string;
  subtitle?: string;
  videoUrl: string;
  posterUrl?: string;
};

type Props = {
  heading?: string;
  tagline?: string;
  videos?: VideoItem[];
};

/* ------------------------------------------------------------------
   @leiraindia REELS — hosted on Cloudinary.
------------------------------------------------------------------- */
const REEL_URLS = [
  "https://res.cloudinary.com/f6mzepya/video/upload/v1791290114/Leira_18_sept_update.mp4",
  "https://res.cloudinary.com/f6mzepya/video/upload/v1791289958/Leira_8_sept.mp4",
  "https://res.cloudinary.com/f6mzepya/video/upload/v1791289994/Leira_3_sept_update.mp4",
  "https://res.cloudinary.com/f6mzepya/video/upload/v1791290037/Leira_21_September-.mp4",
  "https://res.cloudinary.com/f6mzepya/video/upload/v1791290044/Leira_5_october.mp4",
  "https://res.cloudinary.com/f6mzepya/video/upload/v1791290072/Leira_16_sept_update.mp4",
];

// Cloudinary renders a poster JPG from the video when the extension is .jpg
const posterFrom = (mp4: string) => mp4.replace(/\.mp4($|\?)/, ".jpg$1");

const PLACEHOLDERS: VideoItem[] = REEL_URLS.map((url, i) => ({
  id: `reel-${i + 1}`,
  title: "",
  subtitle: "",
  videoUrl: url,
  posterUrl: posterFrom(url),
}));

const ASPECT = "9 / 16"; // portrait reels; use "16 / 9" for landscape
const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '"Jost", system-ui, -apple-system, sans-serif';

const INK = "#3f2430";
const PLUM = "#7a2c4e";
const MUTED = "#8a7480";

const GAP = 18;
const SIDE_PAD = "clamp(20px, 5vw, 48px)"; // left/right breathing room inside the full-width row
const LIGHTBOX_Z = 2147483000; // above any navbar / sticky header

/* ---------- card (preview, autoplay while visible) ---------- */
function VideoCard({ item, onOpen }: { item: VideoItem; onOpen: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        });
      },
      { threshold: 0.4 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Play ${item.title || "video"}`}
      style={{
        position: "relative",
        flex: "none",
        width: "clamp(220px, 68vw, 288px)",
        aspectRatio: ASPECT,
        borderRadius: 18,
        overflow: "hidden",
        border: "none",
        padding: 0,
        cursor: "pointer",
        background: "linear-gradient(170deg, #f6e4ec, #fdf1f5)",
        boxShadow: "0 18px 40px -22px rgba(63, 36, 48, 0.55)",
        display: "block",
      }}
    >
      <video
        ref={ref}
        src={item.videoUrl}
        poster={item.posterUrl || undefined}
        muted
        loop
        playsInline
        preload="metadata"
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
      />

      {/* play glyph */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 54,
          height: 54,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.22)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          border: "1px solid rgba(255,255,255,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>

      {(item.title || item.subtitle) && (
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "40px 18px 18px",
            textAlign: "left",
            background: "linear-gradient(to top, rgba(43,15,29,0.72) 0%, rgba(43,15,29,0.25) 55%, rgba(43,15,29,0) 100%)",
          }}
        >
          {item.title && (
            <span style={{ display: "block", fontFamily: SERIF, fontWeight: 400, fontSize: 19, color: "#fff" }}>
              {item.title}
            </span>
          )}
          {item.subtitle && (
            <span style={{ display: "block", fontFamily: SANS, fontWeight: 300, fontSize: 12.5, color: "rgba(255,255,255,0.82)", marginTop: 3 }}>
              {item.subtitle}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

/* ---------- lightbox (portal → always above the navbar) ---------- */
function Lightbox({
  items,
  index,
  onClose,
  onNavigate,
}: {
  items: VideoItem[];
  index: number;
  onClose: () => void;
  onNavigate: (next: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const item = items[index];

  // autoplay the opened video (with sound, since it's a user action)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
  }, [index]);

  // lock page scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // keyboard: Esc close, arrows navigate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNavigate((index + 1) % items.length);
      else if (e.key === "ArrowLeft") onNavigate((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onNavigate]);

  const go = (dir: 1 | -1) => onNavigate((index + dir + items.length) % items.length);

  const circleBtn: React.CSSProperties = {
    width: 46,
    height: 46,
    borderRadius: "50%",
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.9)",
    color: "#111",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
    boxShadow: "0 6px 16px -8px rgba(0,0,0,0.4)",
    transition: "background 160ms ease",
  };

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title || "Video"}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: LIGHTBOX_Z,
        fontFamily: SANS,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        background: "rgba(25, 8, 16, 0.9)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        overscrollBehavior: "contain",
      }}
    >
      {/* close */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          width: 42,
          height: 42,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.3)",
          background: "rgba(255,255,255,0.1)",
          color: "#fff",
          fontSize: 22,
          lineHeight: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
        }}
      >
        ×
      </button>

      {/* stage: arrow · video · arrow */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", alignItems: "center", gap: "clamp(10px, 3vw, 26px)", maxWidth: "100%" }}
      >
        <button type="button" aria-label="Previous" onClick={() => go(-1)} style={circleBtn}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#fff")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.9)")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div
          style={{
            position: "relative",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 30px 90px -30px rgba(0,0,0,0.8)",
            background: "#000",
          }}
        >
          <video
            key={item.videoUrl}
            ref={videoRef}
            src={item.videoUrl}
            poster={item.posterUrl || undefined}
            controls
            autoPlay
            loop
            playsInline
            style={{
              display: "block",
              width: "auto",
              height: "86vh",
              maxHeight: "86vh",
              maxWidth: "calc(100vw - 160px)",
              background: "#000",
            }}
          />
        </div>

        <button type="button" aria-label="Next" onClick={() => go(1)} style={circleBtn}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#fff")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.9)")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* caption (only if the video has one — no counter) */}
      {(item.title || item.subtitle) && (
        <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", marginTop: 16, color: "#fff", maxWidth: 420 }}>
          {item.title && <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 400 }}>{item.title}</div>}
          {item.subtitle && <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 300, color: "rgba(255,255,255,0.75)", marginTop: 3 }}>{item.subtitle}</div>}
        </div>
      )}
    </div>
  );

  // Portal to <body> so no parent stacking context (sticky header, transforms) can sit on top
  return createPortal(overlay, document.body);
}

/* ---------- timeline pagination ---------- */
function Timeline({
  count,
  progress,
  active,
  onJump,
}: {
  count: number;
  progress: number; // 0..1 across the whole row
  active: number;
  onJump: (i: number) => void;
}) {
  // one continuous line: click anywhere on it to jump to the nearest video
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    onJump(Math.round(ratio * (count - 1)));
  };

  return (
    <div
      role="slider"
      aria-label="Video timeline"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={active + 1}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onJump(Math.min(count - 1, active + 1));
        if (e.key === "ArrowLeft") onJump(Math.max(0, active - 1));
      }}
      style={{
        width: "min(560px, calc(100% - 40px))",
        height: 20, // generous tap area; the visible line is inside
        margin: "clamp(24px, 4vw, 34px) auto 0",
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
        outline: "none",
      }}
    >
      <span
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          height: 3,
          borderRadius: 999,
          background: "rgba(122, 44, 78, 0.16)",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: "left center",
            transform: `scaleX(${Math.max(1 / count, progress)})`,
            background: PLUM,
            borderRadius: 999,
            transition: "transform 120ms linear",
          }}
        />
      </span>
    </div>
  );
}

/* ----------------------------- section ----------------------------- */
export default function VideoCarousel({
  heading = "Leira in motion",
  tagline = "Reels, moments and behind-the-scenes from @leiraindia.",
  videos,
}: Props) {
  const list = videos && videos.length ? videos : PLACEHOLDERS;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // ---- scroll progress + active card for the timeline ----
  const updateProgress = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const p = max > 0 ? el.scrollLeft / max : 1;
    setProgress(p);
    setActive(Math.min(list.length - 1, Math.round(p * (list.length - 1))));
  }, [list.length]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateProgress);
    };
    updateProgress();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [updateProgress]);

  const jumpTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const target = list.length > 1 ? (i / (list.length - 1)) * max : 0;
    el.scrollTo({ left: target, behavior: "smooth" });
  };

  // ---- drag to scroll (no content selection; swallow click after drag) ----
  const draggedRef = useRef(false);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let down = false;
    let startX = 0;
    let startLeft = 0;
    let captured = false;

    const onDown = (e: PointerEvent) => {
      down = true;
      captured = false;
      draggedRef.current = false;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) {
        draggedRef.current = true;
        if (!captured) {
          el.setPointerCapture?.(e.pointerId);
          captured = true;
          el.style.scrollSnapType = "none"; // smooth manual drag
        }
        el.scrollLeft = startLeft - dx;
      }
    };
    const onUp = (e: PointerEvent) => {
      down = false;
      if (captured) el.releasePointerCapture?.(e.pointerId);
      captured = false;
      el.style.cursor = "grab";
      el.style.scrollSnapType = "x mandatory";
      window.setTimeout(() => { draggedRef.current = false; }, 0);
    };
    const onClickCapture = (e: MouseEvent) => {
      if (draggedRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.style.cursor = "grab";
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  return (
    <section
      aria-label={heading}
      style={{
        position: "relative",
        width: "100%",
        fontFamily: SANS,
        background: "linear-gradient(180deg, #fffdfc 0%, #fdf1f5 100%)",
        padding: "clamp(48px, 8vw, 84px) 0",
        overflow: "hidden",
      }}
    >
      {/* header (kept centred & padded) */}
      <div style={{ textAlign: "center", padding: `0 ${SIDE_PAD}`, marginBottom: "clamp(28px, 5vw, 44px)" }}>
        <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: "clamp(30px, 5vw, 44px)", fontWeight: 300, color: INK, lineHeight: 1.15 }}>
          {heading}
        </h2>
        {tagline && (
          <p style={{ fontFamily: SANS, maxWidth: 520, margin: "10px auto 0", fontSize: 14.5, fontWeight: 300, lineHeight: 1.55, color: MUTED }}>
            {tagline}
          </p>
        )}
      </div>

      {/* full-width carousel */}
      <div
        ref={trackRef}
        className="leira-video-track"
        style={{
          display: "flex",
          gap: GAP,
          width: "100%",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollPaddingInline: SIDE_PAD,
          paddingInline: SIDE_PAD,
          paddingBottom: 6,
          boxSizing: "border-box",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {list.map((item, i) => (
          <div data-card key={item._id || item.id || i} style={{ display: "flex", flex: "none", scrollSnapAlign: "start" }}>
            <VideoCard item={item} onOpen={() => { if (!draggedRef.current) setOpenIndex(i); }} />
          </div>
        ))}
        {/* trailing spacer so the last card keeps the right-side padding */}
        <div aria-hidden style={{ flex: "none", width: 1 }} />
      </div>
      <style>{`.leira-video-track::-webkit-scrollbar{display:none;}`}</style>

      {/* timeline pagination */}
      <Timeline count={list.length} progress={progress} active={active} onJump={jumpTo} />

      {openIndex !== null && (
        <Lightbox
          items={list}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={(n) => setOpenIndex(n)}
        />
      )}
    </section>
  );
}
