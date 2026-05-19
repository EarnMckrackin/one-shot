"use client";
import { useState, useRef, useEffect } from "react";

// Replaces native <select> to avoid Android WebView binder crash.
// API: value, onChange({ target: { value } }), options=[{ value, label }], style, id
export default function CustomSelect({ id, value, onChange, options = [], style, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = options.find(o => String(o.value) === String(value));
  const label = selected?.label ?? "";

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  function pick(val) {
    onChange({ target: { value: val } });
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`ink-input ${className}`.trim()}
        style={{
          width: "100%",
          padding: "6px 10px",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          cursor: "pointer",
          fontSize: "inherit",
          minHeight: 38,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {label}
        </span>
        <span style={{ flexShrink: 0, fontSize: 10, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: "100%",
            zIndex: 1000,
            background: "var(--bg-card)",
            border: "2px solid var(--ink-000)",
            boxShadow: "3px 3px 0 var(--ink-000)",
            borderRadius: 10,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={String(opt.value) === String(value)}
              onClick={() => pick(opt.value)}
              style={{
                display: "block",
                width: "100%",
                padding: "9px 14px",
                textAlign: "left",
                background: String(opt.value) === String(value) ? "var(--bg-elevated)" : "transparent",
                color: "var(--text)",
                border: "none",
                borderBottom: "1px solid var(--bg-elevated)",
                cursor: "pointer",
                fontSize: "inherit",
                fontWeight: String(opt.value) === String(value) ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
