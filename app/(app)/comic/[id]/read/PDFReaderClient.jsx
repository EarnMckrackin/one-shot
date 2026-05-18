"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { FileViewer } from "@capacitor/file-viewer";
import { readReaderProgress, writeReaderProgress } from "../../../../../lib/local-data-store";
import { ensureNativePdf, getLocalPdf, saveLocalPdfBlob } from "../../../../../lib/local-pdf-store";

export default function PDFReaderClient({ comic }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const renderRunRef = useRef(0);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [renderedPage, setRenderedPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfBytes, setPdfBytes] = useState(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [openingNative, setOpeningNative] = useState(false);

  const title = useMemo(() => {
    return `${comic.title}${comic.issue_number ? ` #${comic.issue_number}` : ""}`;
  }, [comic.title, comic.issue_number]);

  useEffect(() => {
    const saved = readReaderProgress(comic.id);
    if (saved?.zoom) setZoom(saved.zoom);
    if (saved?.pageNumber) setCurrentPage(Math.max(1, saved.pageNumber));
  }, [comic.id]);

  useEffect(() => {
    writeReaderProgress(comic.id, {
      pageNumber: currentPage,
      pageCount,
      zoom,
      viewerMode: "canvas",
    });
  }, [comic.id, currentPage, pageCount, zoom]);

  useEffect(() => {
    let active = true;
    let localUrl = "";

    async function resolvePdf() {
      setError("");
      setPdfBytes(null);
      setPdfUrl("");
      setSourceLabel("");
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
        const buffer = await res.arrayBuffer();
        const blob = new Blob([buffer], { type: "application/pdf" });
        await saveLocalPdfBlob(comic.id, blob, `${title}.pdf`);
        const objectUrl = URL.createObjectURL(blob);
        localUrl = objectUrl;
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setPdfUrl(objectUrl);
        setPdfBytes(new Uint8Array(buffer));
        setSourceLabel("Saved locally from Google Drive");
        return;
      }

      setError("This PDF is not stored on this device. Add or replace the PDF from the comic detail page.");
    }

    resolvePdf().catch((err) => {
      if (active) setError(err?.message || "Unable to load this PDF.");
    });

    return () => {
      active = false;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [comic.id, comic.drive_file_id, title]);

  useEffect(() => {
    if (!pdfBytes) return undefined;
    let cancelled = false;
    const renderRun = renderRunRef.current + 1;
    renderRunRef.current = renderRun;

    async function renderPdfPage() {
      setError("");
      setRenderedPage(0);

      try {
        installPdfJsPolyfills();
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

        const pdf = await pdfjs.getDocument({
          data: pdfBytes.slice(),
          disableWorker: true,
          isEvalSupported: false,
          useSystemFonts: true,
        }).promise;
        if (cancelled || renderRunRef.current !== renderRun) return;

        setPageCount(pdf.numPages);
        const pageNumber = Math.max(1, Math.min(currentPage, pdf.numPages));
        if (pageNumber !== currentPage) {
          setCurrentPage(pageNumber);
          return;
        }

        await waitForCanvas(canvasRef);
        if (cancelled || renderRunRef.current !== renderRun) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.min(containerRef.current?.clientWidth || 360, 960);
        const scale = (availableWidth / baseViewport.width) * zoom;
        const viewport = page.getViewport({ scale });
        const deviceScale = Math.min(window.devicePixelRatio || 1, Capacitor.getPlatform() === "web" ? 1.75 : 1.5);

        await renderPageToCanvas(page, canvas, viewport, deviceScale);
        if (isCanvasBlank(canvas)) {
          await renderPageToCanvas(page, canvas, viewport, 1);
        }
        if (!cancelled) setRenderedPage(pageNumber);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Unable to render this PDF.");
      }
    }

    renderPdfPage();

    return () => {
      cancelled = true;
    };
  }, [pdfBytes, currentPage, zoom]);

  async function openNativePdf() {
    setOpeningNative(true);
    try {
      const native = await ensureNativePdf(comic.id);
      if (Capacitor.getPlatform() !== "web" && native?.uri) {
        await FileViewer.openDocumentFromLocalPath({ path: nativePath(native.uri) });
        return;
      }
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
        return;
      }
      throw new Error("No PDF file is available on this device.");
    } catch (err) {
      setError(err?.message || "Could not open the PDF externally.");
    } finally {
      setOpeningNative(false);
    }
  }

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
            style={s.layoutBtn}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage <= 1}
          >
            Prev
          </button>
          <span style={s.pagePill}>{pageCount ? `${currentPage}/${pageCount}` : "--"}</span>
          <button
            type="button"
            style={s.layoutBtn}
            onClick={() => setCurrentPage((page) => Math.min(pageCount || page + 1, page + 1))}
            disabled={!pageCount || currentPage >= pageCount}
          >
            Next
          </button>
          <button
            type="button"
            style={s.openBtn}
            onClick={openNativePdf}
            disabled={openingNative}
          >
            {openingNative ? "Opening..." : "Open Externally"}
          </button>
        </div>
      </div>

      {error ? (
        <div style={s.notice}>
          <h2 style={s.noticeTitle}>Could not render the PDF</h2>
          <p style={s.noticeText}>{error}</p>
          <button type="button" style={s.noticeButton} onClick={openNativePdf}>
            Open Externally
          </button>
        </div>
      ) : (
        <>
          <p style={s.progress}>
            {pageCount ? `Page ${currentPage} of ${pageCount}${renderedPage === currentPage ? "" : " loading..."}` : "Loading PDF..."}
          </p>
          <div ref={containerRef} style={s.reader}>
            <canvas ref={canvasRef} style={s.canvas} />
          </div>
        </>
      )}
    </div>
  );
}

function nativePath(uri) {
  return String(uri || "").replace(/^file:\/\//, "");
}

function waitForCanvas(canvasRef) {
  return new Promise((resolve) => {
    let attempts = 0;
    function check() {
      attempts += 1;
      if (canvasRef.current || attempts > 30) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  });
}

function installPdfJsPolyfills() {
  if (typeof Promise.withResolvers !== "function") {
    Promise.withResolvers = function withResolvers() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
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
  pagePill: {
    minHeight: 34,
    display: "inline-flex",
    alignItems: "center",
    padding: "0 10px",
    border: "2px solid var(--ink-000)",
    borderRadius: 8,
    background: "var(--bg-card)",
    color: "var(--text-soft)",
    boxShadow: "2px 2px 0 var(--ink-000)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
  },
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
};
