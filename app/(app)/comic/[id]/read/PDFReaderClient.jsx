"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { FileViewer } from "@capacitor/file-viewer";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readReaderProgress, writeReaderProgress } from "../../../../../lib/local-data-store";
import { ensureNativePdf, getLocalPdf, saveLocalPdfBlob } from "../../../../../lib/local-pdf-store";

configurePdfWorker();

export default function PDFReaderClient({ comic }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const docRef = useRef(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(360);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [pdfData, setPdfData] = useState(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [openingNative, setOpeningNative] = useState(false);
  const [renderStats, setRenderStats] = useState("");

  const title = useMemo(() => `${comic.title}${comic.issue_number ? ` #${comic.issue_number}` : ""}`, [comic.title, comic.issue_number]);

  useEffect(() => {
    const saved = readReaderProgress(comic.id);
    if (saved?.zoom) setZoom(saved.zoom);
    if (saved?.pageNumber) setCurrentPage(Math.max(1, saved.pageNumber));
  }, [comic.id]);

  useEffect(() => {
    writeReaderProgress(comic.id, { pageNumber: currentPage, pageCount, zoom, viewerMode: "pdfjs-canvas" });
  }, [comic.id, currentPage, pageCount, zoom]);

  useEffect(() => {
    let active = true;
    let localUrl = "";

    async function resolvePdf() {
      setError("");
      setPdfData(null);
      setSourceLabel("");
      setPageCount(0);

      const local = await getLocalPdf(comic.id).catch(() => null);
      if (!active) return;

      if (local?.blob) {
        const bytes = new Uint8Array(await local.blob.arrayBuffer());
        localUrl = URL.createObjectURL(local.blob);
        if (!active) return;
        setPdfData(bytes);
        setPdfUrl(localUrl);
        setSourceLabel("Device");
        return;
      }

      if (comic.drive_file_id) {
        const res = await fetch(`/api/google/pdf/${comic.id}`);
        if (!res.ok) throw new Error(`Could not load Google Drive PDF. HTTP ${res.status}.`);
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const blob = new Blob([buffer], { type: "application/pdf" });
        await saveLocalPdfBlob(comic.id, blob, `${title}.pdf`);
        localUrl = URL.createObjectURL(blob);
        if (!active) return;
        setPdfData(bytes);
        setPdfUrl(localUrl);
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
      renderTaskRef.current?.cancel?.();
      docRef.current?.destroy?.();
    };
  }, [comic.id, comic.drive_file_id, title]);

  useEffect(() => {
    function updateWidth() {
      const width = Math.min(window.innerWidth - 32, 980);
      setContainerWidth(Math.max(300, width));
    }
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    if (!pdfData) return;
    let active = true;

    async function loadDoc() {
      setLoadingDoc(true);
      setError("");
      setRenderStats("");
      renderTaskRef.current?.cancel?.();
      docRef.current?.destroy?.();
      docRef.current = null;

      try {
        const loadingTask = getDocument({
          data: pdfData,
          isEvalSupported: false,
          useSystemFonts: true,
          isOffscreenCanvasSupported: false,
          useWorkerFetch: false,
        });
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PDF load timed out — worker may have failed to start.")), 15000)
        );
        const pdfDoc = await Promise.race([loadingTask.promise, timeout]);
        if (!active) {
          await pdfDoc.destroy();
          return;
        }
        docRef.current = pdfDoc;
        setPageCount(pdfDoc.numPages || 0);
        setCurrentPage((page) => Math.min(Math.max(1, page), Math.max(1, pdfDoc.numPages || 1)));
      } catch (err) {
        if (active) setError(err?.message || "Unable to load this PDF document.");
      } finally {
        if (active) setLoadingDoc(false);
      }
    }

    loadDoc();
    return () => {
      active = false;
    };
  }, [pdfData]);

  useEffect(() => {
    if (!docRef.current || !canvasRef.current || !pageCount) return;
    let cancelled = false;

    async function renderPage() {
      try {
        renderTaskRef.current?.cancel?.();
        const page = await docRef.current.getPage(currentPage);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = (containerWidth / baseViewport.width) * zoom;
        const viewport = page.getViewport({ scale: cssScale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas context unavailable.");

        const maxPixels = 6_000_000;
        const maxEdge = 4096;
        const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
        const rawWidth = Math.max(1, Math.floor(viewport.width * deviceScale));
        const rawHeight = Math.max(1, Math.floor(viewport.height * deviceScale));
        const edgeScale = Math.min(1, maxEdge / Math.max(rawWidth, rawHeight));
        const pixelScale = Math.min(1, Math.sqrt(maxPixels / (rawWidth * rawHeight)));
        const safeScale = Math.min(edgeScale, pixelScale);
        const outputScale = Math.max(0.5, deviceScale * safeScale);

        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.imageSmoothingEnabled = true;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const task = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
        setRenderStats(`Rendered ${canvas.width}x${canvas.height} @${outputScale.toFixed(2)}x`);
      } catch (err) {
        if (!cancelled && err?.name !== "RenderingCancelledException") {
          setError(err?.message || "Unable to render this PDF page.");
        }
      }
    }

    renderPage();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
    };
  }, [currentPage, containerWidth, zoom, pageCount]);

  async function openNativePdf() {
    setOpeningNative(true);
    try {
      const native = await ensureNativePdf(comic.id);
      if (Capacitor.getPlatform() !== "web" && native?.uri) {
        await FileViewer.openDocumentFromLocalPath({ path: nativePath(native.uri) });
        return;
      }
      if (pdfUrl) window.open(pdfUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err?.message || "Could not open native PDF viewer.");
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
          <button type="button" style={s.iconBtn} onClick={() => setZoom((z) => Math.min(2.2, z + 0.15))}>+</button>
          <button type="button" style={s.layoutBtn} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>Prev</button>
          <span style={s.pagePill}>{pageCount ? `${currentPage}/${pageCount}` : "--"}</span>
          <button type="button" style={s.layoutBtn} onClick={() => setCurrentPage((p) => Math.min(pageCount || p + 1, p + 1))} disabled={!pageCount || currentPage >= pageCount}>Next</button>
          <button type="button" style={s.layoutBtn} onClick={openNativePdf} disabled={openingNative}>
            {openingNative ? "Opening..." : "Fallback"}
          </button>
        </div>
      </div>

      {error ? (
        <div style={s.notice}>
          <h2 style={s.noticeTitle}>Could not render the PDF</h2>
          <p style={s.noticeText}>{error}</p>
          <button type="button" style={s.noticeButton} onClick={openNativePdf}>Open Fallback</button>
        </div>
      ) : (
        <>
          <p style={s.progress}>{loadingDoc ? "Loading PDF..." : pageCount ? `Page ${currentPage} of ${pageCount}` : "Loading PDF..."}</p>
          {!loadingDoc && renderStats && <p style={s.debug}>{renderStats}</p>}
          <div style={s.reader}>
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

function configurePdfWorker() {
  if (typeof window === "undefined" || typeof Worker === "undefined") return;
  if (GlobalWorkerOptions.workerPort || GlobalWorkerOptions.workerSrc) return;
  // Use a stable public path so Android WebView can reliably fetch the worker
  // without depending on webpack's import.meta.url URL-replacement heuristic.
  const workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
  try {
    GlobalWorkerOptions.workerPort = new Worker(workerSrc, { type: "module" });
  } catch {
    GlobalWorkerOptions.workerSrc = workerSrc;
  }
}

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

const s = {
  page: { width: "100%", maxWidth: 1040, margin: "0 auto" },
  toolbar: { position: "sticky", top: "calc(60px + env(safe-area-inset-top, 0px))", zIndex: 20, display: "flex", alignItems: "center", gap: 12, padding: "10px 0 14px", background: "var(--bg)", borderBottom: "2px solid var(--ink-000)", flexWrap: "wrap" },
  back: { fontFamily: "var(--font-burst)", fontSize: 14, letterSpacing: "0.1em", color: "var(--hero-gold)", textTransform: "uppercase" },
  titleWrap: { flex: 1, minWidth: 180 },
  source: { color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 },
  eyebrow: { fontFamily: "var(--font-burst)", fontSize: 11, letterSpacing: "0.14em", color: "var(--hero-cyan)", textTransform: "uppercase" },
  title: { fontFamily: "var(--font-serif)", fontSize: 22, lineHeight: 1.15, margin: 0 },
  controls: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  iconBtn: { width: 34, height: 34, border: "2px solid var(--ink-000)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text)", boxShadow: "2px 2px 0 var(--ink-000)", fontWeight: 800 },
  zoom: { minWidth: 46, textAlign: "center", color: "var(--text-soft)", fontSize: 12 },
  pagePill: { minHeight: 34, display: "inline-flex", alignItems: "center", padding: "0 10px", border: "2px solid var(--ink-000)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-soft)", boxShadow: "2px 2px 0 var(--ink-000)", fontFamily: "var(--font-mono)", fontSize: 12 },
  layoutBtn: { minHeight: 34, padding: "0 10px", border: "2px solid var(--ink-000)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text)", boxShadow: "2px 2px 0 var(--ink-000)", fontFamily: "var(--font-burst)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" },
  progress: { margin: "14px 0", color: "var(--text-soft)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" },
  debug: { margin: "0 0 10px", color: "var(--text-faint)", fontSize: 11 },
  reader: { display: "flex", justifyContent: "center", paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))" },
  canvas: { maxWidth: "100%", background: "#fff", border: "2px solid var(--ink-000)", boxShadow: "4px 4px 0 var(--ink-000)", borderRadius: 4 },
  notice: { marginTop: 24, padding: 18, background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 10, boxShadow: "3px 3px 0 var(--ink-000)" },
  noticeTitle: { fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8 },
  noticeText: { color: "var(--text-soft)", marginBottom: 14 },
  noticeButton: { color: "var(--hero-gold)", fontWeight: 700, background: "transparent", border: 0, padding: 0, cursor: "pointer" },
};
