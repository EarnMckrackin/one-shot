"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { FileViewer } from "@capacitor/file-viewer";
import { readReaderProgress, writeReaderProgress } from "../../../../../lib/local-data-store";
import { ensureNativePdf, getLocalPdf, saveLocalPdfBlob } from "../../../../../lib/local-pdf-store";

export default function PDFReaderClient({ comic }) {
  const isNativeRuntime = Capacitor.getPlatform() !== "web";
  const containerRef = useRef(null);
  const canvasRefs = useRef(new Map());
  const renderRunRef = useRef(0);
  const nativeOpenAttemptedRef = useRef(false);
  const [pageCount, setPageCount] = useState(0);
  const [renderedPage, setRenderedPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfBytes, setPdfBytes] = useState(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [layoutMode, setLayoutMode] = useState("single");
  const [viewerMode, setViewerMode] = useState(isNativeRuntime ? "native" : "canvas");
  const [openingNative, setOpeningNative] = useState(false);
  const [lastOpenedPage, setLastOpenedPage] = useState(null);

  const title = useMemo(() => {
    return `${comic.title}${comic.issue_number ? ` #${comic.issue_number}` : ""}`;
  }, [comic.title, comic.issue_number]);

  useEffect(() => {
    const saved = readReaderProgress(comic.id);
    nativeOpenAttemptedRef.current = false;
    if (saved?.zoom) setZoom(saved.zoom);
    if (saved?.layoutMode) setLayoutMode(saved.layoutMode);
    if (!isNativeRuntime && saved?.viewerMode) setViewerMode(saved.viewerMode);
    if (saved?.pageNumber) setLastOpenedPage(saved.pageNumber);
  }, [comic.id, isNativeRuntime]);

  useEffect(() => {
    writeReaderProgress(comic.id, {
      pageNumber: Math.max(renderedPage, lastOpenedPage ?? 0),
      pageCount,
      zoom,
      layoutMode,
      viewerMode,
    });
  }, [comic.id, renderedPage, pageCount, zoom, layoutMode, viewerMode, lastOpenedPage]);

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
        setPdfBytes(isNativeRuntime ? null : bytes);
        setSourceLabel("Device");
        return;
      }
      if (comic.drive_file_id) {
        const url = `/api/google/pdf/${comic.id}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not load Google Drive PDF. HTTP ${res.status}.`);
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const blob = new Blob([buffer], { type: "application/pdf" });
        if (isNativeRuntime) {
          await saveLocalPdfBlob(comic.id, blob, `${title}.pdf`);
        }
        if (!active) return;
        setPdfUrl(url);
        setPdfBytes(isNativeRuntime ? null : bytes);
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
  }, [comic.id, comic.drive_file_id, isNativeRuntime, title]);

  async function openNativePdf() {
    setOpeningNative(true);
    setError("");
    try {
      const native = await ensureNativePdf(comic.id);
      if (Capacitor.getPlatform() !== "web" && native?.uri) {
        await FileViewer.openDocumentFromLocalPath({ path: nativePath(native.uri) });
        setViewerMode("native");
        return;
      }
      if (pdfUrl) {
        setViewerMode("native");
        return;
      }
      throw new Error("No PDF file is available on this device.");
    } catch (err) {
      setError(err?.message || "Could not open the PDF with a native viewer.");
    } finally {
      setOpeningNative(false);
    }
  }

  useEffect(() => {
    if (!isNativeRuntime || !sourceLabel || nativeOpenAttemptedRef.current) return;
    nativeOpenAttemptedRef.current = true;
    openNativePdf();
  }, [isNativeRuntime, sourceLabel]);

  useEffect(() => {
    if (!pdfBytes || viewerMode === "native") return undefined;
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

        const pdf = await pdfjs.getDocument({
          data: pdfBytes.slice(),
          disableWorker: true,
          isEvalSupported: false,
          useSystemFonts: true,
        }).promise;
        if (cancelled || renderRunRef.current !== renderRun) return;

        setPageCount(pdf.numPages);
        await waitForCanvases(canvasRefs, pdf.numPages);

        const availableWidth = Math.min(containerRef.current?.clientWidth || 360, 860);
        const pageTargetWidth = layoutMode === "spread"
          ? Math.max(150, Math.floor((availableWidth - 18) / 2))
          : availableWidth;
        const deviceScale = Math.min(window.devicePixelRatio || 1, 1.35);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled || renderRunRef.current !== renderRun) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = (pageTargetWidth / baseViewport.width) * zoom;
          const viewport = page.getViewport({ scale });
          const canvas = canvasRefs.current.get(pageNumber);

          if (!canvas) continue;

          await renderPageToCanvas(page, canvas, viewport, deviceScale);
          if (isCanvasBlank(canvas)) {
            await renderPageToCanvas(page, canvas, viewport, 1);
          }
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
  }, [pdfBytes, zoom, layoutMode, viewerMode]);

  return (
    <div style={s.page}>
      <div style={s.toolbar}>
        <Link href={`/comic/${comic.id}`} style={s.back}>Back</Link>
        <div style={s.titleWrap}>
          <p style={s.eyebrow}>PDF Reader</p>
          <h1 style={s.title}>{title}</h1>
          {sourceLabel && <p style={s.source}>{sourceLabel}</p>}
          {lastOpenedPage && <p style={s.source}>Last opened page {lastOpenedPage}</p>}
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
          <button
            type="button"
            style={{ ...s.layoutBtn, ...(viewerMode === "native" ? s.layoutBtnActive : {}) }}
            onClick={() => setViewerMode((mode) => mode === "canvas" ? "native" : "canvas")}
            disabled={isNativeRuntime || !pdfUrl}
          >
            {viewerMode === "canvas" ? "Browser View" : "Rendered View"}
          </button>
          <button
            type="button"
            style={s.openBtn}
            onClick={openNativePdf}
            disabled={openingNative}
          >
            {openingNative ? "Opening..." : "Open in Viewer"}
          </button>
        </div>
      </div>

      {error ? (
        <div style={s.notice}>
          <h2 style={s.noticeTitle}>{isNativeRuntime ? "Could not open the native reader" : "Could not render the PDF"}</h2>
          <p style={s.noticeText}>{error}</p>
          <button type="button" style={s.noticeButton} onClick={openNativePdf}>Open in Viewer</button>
        </div>
      ) : isNativeRuntime ? (
        <div style={s.notice}>
          <h2 style={s.noticeTitle}>{openingNative ? "Opening native reader..." : "Native PDF reader"}</h2>
          <p style={s.noticeText}>
            PDFs open with the device PDF viewer in the mobile app. Use the button below if it does not reopen automatically.
          </p>
          <button type="button" style={s.noticeButton} onClick={openNativePdf} disabled={openingNative}>
            {openingNative ? "Opening..." : "Open PDF"}
          </button>
        </div>
      ) : viewerMode === "native" ? (
        <div style={s.nativeWrap}>
          {pdfUrl ? (
            <iframe title={title} src={pdfUrl} style={s.nativeFrame} />
          ) : (
            <p style={s.noticeText}>No local PDF URL is available.</p>
          )}
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

function nativePath(uri) {
  return String(uri || "").replace(/^file:\/\//, "");
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

async function renderPageToCanvas(page, canvas, viewport, deviceScale) {
  canvas.width = 1;
  canvas.height = 1;
  canvas.width = Math.max(1, Math.floor(viewport.width * deviceScale));
  canvas.height = Math.max(1, Math.floor(viewport.height * deviceScale));
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const context = canvas.getContext("2d", { alpha: false });
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

  await page.render({
    canvasContext: context,
    viewport,
    background: "white",
  }).promise;
}

function isCanvasBlank(canvas) {
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return true;

    const sampleSize = 8;
    const points = [
      [0.5, 0.5],
      [0.2, 0.2],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.8, 0.8],
      [0.5, 0.15],
      [0.5, 0.85],
    ];

    return points.every(([xPct, yPct]) => {
      const x = Math.max(0, Math.min(width - sampleSize, Math.floor(width * xPct)));
      const y = Math.max(0, Math.min(height - sampleSize, Math.floor(height * yPct)));
      const { data } = context.getImageData(x, y, sampleSize, sampleSize);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return false;
      }
      return true;
    });
  } catch {
    return false;
  }
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
    cursor: "pointer",
  },
  layoutBtnActive: {
    background: "var(--hero-cyan)",
    color: "var(--ink-000)",
  },
  openBtn: {
    minHeight: 34,
    padding: "0 12px",
    border: "2px solid var(--ink-000)",
    borderRadius: 8,
    background: "var(--hero-gold)",
    color: "var(--ink-000)",
    boxShadow: "2px 2px 0 var(--ink-000)",
    fontFamily: "var(--font-burst)",
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
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
  noticeButton: {
    color: "var(--hero-gold)",
    fontWeight: 700,
    background: "transparent",
    border: 0,
    padding: 0,
    cursor: "pointer",
  },
  nativeWrap: {
    height: "calc(100dvh - 150px)",
    minHeight: 520,
    marginTop: 14,
    border: "2px solid var(--ink-000)",
    borderRadius: 8,
    overflow: "hidden",
    background: "#fff",
  },
  nativeFrame: {
    width: "100%",
    height: "100%",
    border: 0,
    background: "#fff",
  },
};
