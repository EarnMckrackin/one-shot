"use client";
import { useState } from "react";

export default function ComicCover({ src, alt, size = "md", style = {}, loading = "lazy", className = "" }) {
  const [error, setError]     = useState(false);
  const [loaded, setLoaded]   = useState(false);

  const isPlaceholder = !src || error;

  return (
    <div style={{ ...s.wrap, ...s[size], ...style }} className={`comic-cover-wrap ${className}`}>
      {/* Background/Skeleton */}
      {!loaded && !isPlaceholder && <div style={s.skeleton} />}

      {isPlaceholder ? (
        <div style={s.placeholder}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
          </svg>
          <span style={s.placeholderText}>NO COVER</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt || "Comic cover"}
          loading={loading}
          style={{ ...s.img, opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}

      {/* Glossy Overlay Texture */}
      <div style={s.overlay} />
    </div>
  );
}

const s = {
  wrap: {
    position:        "relative",
    aspectRatio:     "2/3",
    overflow:        "hidden",
    background:      "var(--bg-card)",
    border:          "2px solid var(--ink-000)",
    borderRadius:    "var(--radius-lg)",
    boxShadow:       "3px 3px 0 var(--ink-000)",
    userSelect:      "none",
    transition:      "transform 150ms var(--ease-out)",
  },
  sm: { width: "clamp(48px, 6vw, 76px)" },
  md: { width: "100%" },
  lg: { width: "clamp(180px, 22vw, 260px)" },

  img: {
    width:      "100%",
    height:     "100%",
    objectFit:  "cover",
    display:    "block",
    transition: "opacity 300ms ease-out",
  },

  skeleton: {
    position:   "absolute",
    inset:      0,
    background: "linear-gradient(110deg, var(--bg-card) 45%, var(--ink-400) 50%, var(--bg-card) 55%)",
    backgroundSize: "200% 100%",
    animation:  "shimmer 1.5s infinite linear",
    zIndex:     1,
  },

  placeholder: {
    position:       "absolute",
    inset:          0,
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    gap:            8,
    color:          "var(--text-faint)",
    background:     "var(--bg-surface)",
    backgroundImage: "var(--halftone-dots)",
    backgroundSize: "var(--halftone-size)",
  },
  placeholderText: {
    fontFamily:    "var(--font-burst)",
    fontSize:      10,
    letterSpacing: "0.1em",
  },

  overlay: {
    position:      "absolute",
    inset:         0,
    pointerEvents: "none",
    background:    "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 40%, rgba(0,0,0,0.1) 100%)",
  },
};
