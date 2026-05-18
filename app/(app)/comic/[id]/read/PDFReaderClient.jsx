"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getLocalPdf } from "../../../../../lib/local-pdf-store";

export default function PDFReaderClient({ comic }) {
  const containerRef = useRef(null);
  const canvasRefs = useRef(new Map());
  const renderRunRef = useRef(0);
  const [pageCount, setPageCount] = useState(0);
  const [renderedPage, setRenderedPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfBytes, setPdfBytes] = useState(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [layoutMode, setLayoutMode] = useState("single");

  const title = useMemo(() => {
    return `${comic.title}${comic.issue_number ? ` #${comic.issue_number}` : ""}`;
  }, [comic.title, comic.issue_number]);

  useEffect(() => {
    let active = true;
    let localUrl = "";

    async function resolvePdf() {
      setError("");
      setPdfBytes(null);
      setPageCount(0);
      setRenderedPage(0);
      const local = await getLocalPdf(comic.id).catch(() => null);
      if (!active) return;
      if (local?.blob) {
        const url = URL.createObjectURL(local.blob);
        localUrl = url;
        const bytes = new Uint8Array(await local.blob.arrayBuffer());
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        setPdfUrl(url);
        setPdfBytes(bytes);
        setSourceLabel("Device");
        return;
      }
      if (comic.drive_file_id) {
        const url = `/api/google/pdf/${comic.id}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not load Google Drive PDF. HTTP ${res.status}.`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!active) return;
        setPdfUrl(url);
        setPdfBytes(bytes);
        setSourceLabel("Google Drive");
        return;
      }
      setPdfUrl("");
      setPdfBytes(null);
      setSourceLabel("");
      setError("This PDF is not stored on this device. Add or replace the PDF from the comic detail page.");
    }

    resolvePdf().catch((err) => {
      if (active) setError(err?.message || "Unable to load this PDF.");
    });

    return () => {
      active = false;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [comic.id, comic.drive_file_id]);

  useEffect(() => {
    if (!pdfBytes) return undefined;
    let cancelled = false;
    const renderRun = renderRunRef.current + 1;
    renderRunRef.current = renderRun;

    async function renderPdf() {
      setError("");
      setRenderedPage(0);

      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.mjs",
          import.meta.url
        ).toString();

        const pdf = await pdfjs.getDocument({ data: pdfBytes.slice() }).promise;
        if (cancelled || renderRunRef.current !== renderRun) return;

        setPageCount(pdf.numPages);
        await waitForCanvases(canvasRefs, pdf.numPages);

        const availableWidth = Math.min(containerRef.current?.clientWidth || 360, 980);
        const pageTargetWidth = layoutMode === "spread"
          ? Math.max(150, Math.floor((availableWidth - 18) / 2))
          : availableWidth;
        const deviceScale = window.devicePixelRatio || 1;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled || renderRunRef.current !== renderRun) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = (pageTargetWidth / baseViewport.width) * zoom;
          const viewport = page.getViewport({ scale });
          const canvas = canvasRefs.current.get(pageNumber);

          if (!canvas) continue;

          canvas.width = Math.floor(viewport.width * deviceScale);
          canvas.height = Math.floor(viewport.height * deviceScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const context = canvas.getContext("2d");
          context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

          await page.render({ canvasContext: context, viewport }).promise;
          if (!cancelled) setRenderedPage(pageNumber);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Unable to load this PDF.");
        }
      }
    }

    renderPdf();

    return () => {
      cancelled = true;
    };
  }, [pdfBytes, zoom, layoutMode]);

  return (
    <div style={s.page}>
      <div style={s.toolbar}>
        <Link href={`/comic/${comic.id}`} style={s.back}>Back</Link>
        <div style={s.titleWrap}>
          <p style={s.eyebrow}>PDF Reader</p>
          <h1 style={s.title}>{title}</h1>
          {sourceLabel && <p style={s.source}>{sourceLabel}</p>}
        </div>
        <div style={s.controls}>
          <button type="button" style={s.iconBtn} onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))}>-</button>
          <span style={s.zoom}>{Math.round(zoom * 100)}%</span>
          <button type="button" style={s.iconBtn} onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}>+</button>
          <button
            type="button"
            style={{ ...s.layoutBtn, ...(layoutMode === "spread" ? s.layoutBtnActive : {}) }}
            onClick={() => setLayoutMode((mode) => mode === "single" ? "spread" : "single")}
          >
            {layoutMode === "single" ? "Side by Side" : "Single Page"}
          </button>
          {pdfUrl && <a href={pdfUrl} style={s.download}>Open file</a>}
        </div>
      </div>

      {error ? (
        <div style={s.notice}>
          <h2 style={s.noticeTitle}>Could not render the PDF</h2>
          <p style={s.noticeText}>{error}</p>
          {pdfUrl && <a href={pdfUrl} style={s.noticeLink}>Open the PDF file</a>}
        </div>
      ) : (
        <>
          <p style={s.progress}>
            {pageCount ? `Rendered ${renderedPage} of ${pageCount} pages` : "Loading PDF..."}
          </p>
          <div ref={containerRef} style={{ ...s.reader, ...(layoutMode === "spread" ? s.readerSpread : {}) }}>
            {Array.from({ length: pageCount }, (_, index) => (
              <canvas
                key={index + 1}
                ref={(node) => {
                  if (node) canvasRefs.current.set(index + 1, node);
                  else canvasRefs.current.delete(index + 1);
                }}
                style={s.canvas}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function waitForCanvases(canvasRefs, pageCount) {
  return new Promise((resolve) => {
    let attempts = 0;
    function check() {
      attempts += 1;
      if (canvasRefs.current.size >= pageCount || attempts > 30) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  });
}

const s = {
  page: { width: "100%", maxWidth: 1040, margin: "0 auto" },
  toolbar: {
    position: "sticky",
    top: "calc(60px + env(safe-area-inset-top, 0px))",
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 0 14px",
    background: "var(--bg)",
    borderBottom: "2px solid var(--ink-000)",
    flexWrap: "wrap",
  },
  back: {
    fontFamily: "var(--font-burst)",
    fontSize: 14,
    letterSpacing: "0.1em",
    color: "var(--hero-gold)",
    textTransform: "uppercase",
  },
  titleWrap: { flex: 1, minWidth: 180 },
  source: {
    color: "var(--text-faint)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginTop: 2,
  },
  eyebrow: {
    fontFamily: "var(--font-burst)",
    fontSize: 11,
    letterSpacing: "0.14em",
    color: "var(--hero-cyan)",
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "var(--font-serif)",
    fontSize: 22,
    lineHeight: 1.15,
    margin: 0,
  },
  controls: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  iconBtn: {
    width: 34,
    height: 34,
    border: "2px solid var(--ink-000)",
    borderRadius: 8,
    background: "var(--bg-card)",
    color: "var(--text)",
    boxShadow: "2px 2px 0 var(--ink-000)",
    fontWeight: 800,
  },
  zoom: { minWidth: 46, textAlign: "center", color: "var(--text-soft)", fontSize: 12 },
  layoutBtn: {
    minHeight: 34,
    padding: "0 10px",
    border: "2px solid var(--ink-000)",
    borderRadius: 8,
    background: "var(--bg-card)",
    color: "var(--text)",
    boxShadow: "2px 2px 0 var(--ink-000)",
    fontFamily: "var(--font-burst)",
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  layoutBtnActive: {
    background: "var(--hero-cyan)",
    color: "var(--ink-000)",
  },
  download: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 34,
    padding: "0 12px",
    border: "2px solid var(--ink-000)",
    borderRadius: 8,
    background: "var(--hero-gold)",
    color: "var(--ink-000)",
    boxShadow: "2px 2px 0 var(--ink-000)",
    fontFamily: "var(--font-burst)",
    fontSize: 13,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  progress: {
    margin: "14px 0",
    color: "var(--text-soft)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  reader: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 18,
    paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
  },
  readerSpread: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  canvas: {
    maxWidth: "100%",
    background: "#fff",
    border: "2px solid var(--ink-000)",
    boxShadow: "4px 4px 0 var(--ink-000)",
    borderRadius: 4,
  },
  notice: {
    marginTop: 24,
    padding: 18,
    background: "var(--bg-card)",
    border: "2px solid var(--ink-000)",
    borderRadius: 10,
    boxShadow: "3px 3px 0 var(--ink-000)",
  },
  noticeTitle: { fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8 },
  noticeText: { color: "var(--text-soft)", marginBottom: 14 },
  noticeLink: { color: "var(--hero-gold)", fontWeight: 700 },
};
