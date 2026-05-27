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
  const canvas2Ref = useRef(null);
  const renderTaskRef = useRef(null);
  const renderTask2Ref = useRef(null);
  const docRef = useRef(null);
  const swipeRef = useRef(null);

  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(360);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState("single"); // "single" | "double"
  const [fitMode, setFitMode] = useState("width");    // "width"  | "page"
  const [error, setError] = useState("");
  const [pdfData, setPdfData] = useState(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [openingNative, setOpeningNative] = useState(false);
  const [renderStats, setRenderStats] = useState("");
  const [savingOffline, setSavingOffline] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const driveBlob = useRef(null);

  const title = useMemo(
    () => `${comic.title}${comic.issue_number ? ` #${comic.issue_number}` : ""}`,
    [comic.title, comic.issue_number]
  );

  // Restore saved session
  useEffect(() => {
    const saved = readReaderProgress(comic.id);
    if (saved?.zoom) setZoom(saved.zoom);
    if (saved?.pageNumber) setCurrentPage(Math.max(1, saved.pageNumber));
    if (saved?.viewMode) setViewMode(saved.viewMode);
    if (saved?.fitMode) setFitMode(saved.fitMode);
  }, [comic.id]);

  // Persist session
  useEffect(() => {
    writeReaderProgress(comic.id, {
      pageNumber: currentPage,
      pageCount,
      zoom,
      viewerMode: "pdfjs-canvas",
      viewMode,
      fitMode,
    });
  }, [comic.id, currentPage, pageCount, zoom, viewMode, fitMode]);

  // Resolve PDF bytes from local store or Drive
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
        driveBlob.current = { blob, name: `${title}.pdf` };
        localUrl = URL.createObjectURL(blob);
        if (!active) return;
        setPdfData(bytes);
        setPdfUrl(localUrl);
        setSourceLabel("Google Drive");
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
      renderTask2Ref.current?.cancel?.();
      docRef.current?.destroy?.();
    };
  }, [comic.id, comic.drive_file_id, title]);

  // Track available width
  useEffect(() => {
    function update() {
      setContainerWidth(Math.max(300, Math.min(window.innerWidth - 32, 980)));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Load PDF document
  useEffect(() => {
    if (!pdfData) return;
    let active = true;

    async function loadDoc() {
      setLoadingDoc(true);
      setError("");
      setRenderStats("");
      renderTaskRef.current?.cancel?.();
      renderTask2Ref.current?.cancel?.();
      docRef.current?.destroy?.();
      docRef.current = null;

      try {
        const loadingTask = getDocument({
          data: pdfData,
          isEvalSupported: false,
          useSystemFonts: true,
          isOffscreenCanvasSupported: false,
          useWorkerFetch: false,
          wasmUrl: "/wasm/",
        });
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PDF load timed out — worker may have failed to start.")), 15000)
        );
        const pdfDoc = await Promise.race([loadingTask.promise, timeout]);
        if (!active) { pdfDoc.destroy(); return; }
        docRef.current = pdfDoc;
        setPageCount(pdfDoc.numPages || 0);
        setCurrentPage((p) => Math.min(Math.max(1, p), Math.max(1, pdfDoc.numPages || 1)));
      } catch (err) {
        if (active) setError(err?.message || "Unable to load this PDF document.");
      } finally {
        if (active) setLoadingDoc(false);
      }
    }

    loadDoc();
    return () => { active = false; };
  }, [pdfData]);

  // Render pages — both canvases, both modes
  useEffect(() => {
    if (!docRef.current || !canvasRef.current || !pageCount) return;
    let cancelled = false;

    // Renders one PDF page into a canvas element and returns the render task.
    // Caller must await task.promise and check `cancelled` afterward.
    function paintPage(page, canvas, slotWidth) {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const base = page.getViewport({ scale: 1 });

      // Fit-page: show the full page within the available screen area.
      // Fit-width: fill the slot width (user scrolls vertically).
      let fitScale = slotWidth / base.width;
      if (fitMode === "page") {
        const avH = Math.max(300, window.innerHeight - 160);
        fitScale = Math.min(slotWidth / base.width, avH / base.height);
      }
      const fullScale = fitScale * zoom * dpr;

      const MAX_PX = 5_000_000;
      const MAX_EDGE = 4096;
      const rW = base.width * fullScale;
      const rH = base.height * fullScale;
      const eCap = Math.min(1, MAX_EDGE / Math.max(rW, rH, 1));
      const pCap = Math.min(1, Math.sqrt(MAX_PX / Math.max(rW * rH, 1)));
      const safeScale = Math.max(0.25, fullScale * Math.min(eCap, pCap));

      const vp = page.getViewport({ scale: safeScale });
      const ctx = canvas.getContext("2d", { alpha: false });
      const w = Math.max(1, Math.floor(vp.width));
      const h = Math.max(1, Math.floor(vp.height));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width  = Math.max(1, Math.floor(w / dpr)) + "px";
      canvas.style.height = Math.max(1, Math.floor(h / dpr)) + "px";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      return page.render({ canvasContext: ctx, viewport: vp });
    }

    async function doRender() {
      try {
        renderTaskRef.current?.cancel?.();
        renderTask2Ref.current?.cancel?.();

        const slotW = viewMode === "double"
          ? Math.floor((containerWidth - 12) / 2)
          : containerWidth;

        // Left / single page
        const p1 = await docRef.current.getPage(currentPage);
        if (cancelled) return;
        const t1 = paintPage(p1, canvasRef.current, slotW);
        renderTaskRef.current = t1;
        await t1.promise;
        if (cancelled) return;

        // Right page (double mode only)
        if (viewMode === "double" && canvas2Ref.current) {
          const rightNum = currentPage + 1;
          if (rightNum <= pageCount) {
            const p2 = await docRef.current.getPage(rightNum);
            if (cancelled) return;
            const t2 = paintPage(p2, canvas2Ref.current, slotW);
            renderTask2Ref.current = t2;
            await t2.promise;
          } else {
            // Last page is a single — hide the right slot
            const c = canvas2Ref.current;
            c.width = 1; c.height = 1;
            c.style.width = "0px"; c.style.height = "0px";
          }
        }

        if (!cancelled) {
          const dpr = Math.min(window.devicePixelRatio || 1, 3);
          setRenderStats(`${canvasRef.current?.width}×${canvasRef.current?.height}px @${dpr}x`);
        }
      } catch (err) {
        if (cancelled || err?.name === "RenderingCancelledException") return;
        setError(err?.message || "Unable to render this PDF page.");
      }
    }

    doRender();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
      renderTask2Ref.current?.cancel?.();
    };
  }, [currentPage, containerWidth, zoom, pageCount, viewMode, fitMode]);

  // Navigation
  const pageStep = viewMode === "double" ? 2 : 1;
  const goToPrev = () => setCurrentPage((p) => Math.max(1, p - pageStep));
  const goToNext = () => setCurrentPage((p) => Math.min(pageCount || p, p + pageStep));

  // Swipe-to-navigate — only fires for clearly horizontal swipes
  function onTouchStart(e) {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e) {
    if (!swipeRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeRef.current.x;
    const dy = t.clientY - swipeRef.current.y;
    swipeRef.current = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    dx < 0 ? goToNext() : goToPrev();
  }

  async function saveOffline() {
    if (!driveBlob.current) return;
    setSavingOffline(true);
    try {
      await saveLocalPdfBlob(comic.id, driveBlob.current.blob, driveBlob.current.name);
      setSavedOffline(true);
      setSourceLabel("Device");
    } catch (err) {
      setError(err?.message || "Could not save offline.");
    } finally {
      setSavingOffline(false);
    }
  }

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

  const pageLabel = !pageCount ? "--"
    : viewMode === "double" && currentPage + 1 <= pageCount
      ? `${currentPage}–${currentPage + 1} / ${pageCount}`
      : `${currentPage} / ${pageCount}`;

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
          {/* View mode segment */}
          <div style={s.seg}>
            <button type="button" style={viewMode === "single" ? s.segOn : s.segOff} onClick={() => setViewMode("single")}>1 Page</button>
            <button type="button" style={viewMode === "double" ? s.segOn : s.segOff} onClick={() => setViewMode("double")}>2 Page</button>
          </div>

          {/* Fit mode segment */}
          <div style={s.seg}>
            <button type="button" style={fitMode === "width" ? s.segOn : s.segOff} onClick={() => setFitMode("width")}>Fit W</button>
            <button type="button" style={fitMode === "page"  ? s.segOn : s.segOff} onClick={() => setFitMode("page")}>Fit Page</button>
          </div>

          {/* Zoom */}
          <button type="button" style={s.iconBtn} onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}>−</button>
          <span style={s.zoom}>{Math.round(zoom * 100)}%</span>
          <button type="button" style={s.iconBtn} onClick={() => setZoom((z) => Math.min(3, z + 0.15))}>+</button>

          {/* Navigation */}
          <button type="button" style={s.navBtn} onClick={goToPrev} disabled={currentPage <= 1}>‹</button>
          <span style={s.pagePill}>{pageLabel}</span>
          <button type="button" style={s.navBtn} onClick={goToNext} disabled={!pageCount || currentPage >= pageCount}>›</button>

          {sourceLabel === "Google Drive" && (
            <button
              type="button"
              style={savedOffline ? s.segOn : s.segOff}
              onClick={saveOffline}
              disabled={savingOffline || !driveBlob.current}
              title="Save to this device for offline reading"
            >
              {savingOffline ? "Saving…" : "Save offline"}
            </button>
          )}

          <button type="button" style={s.fallbackBtn} onClick={openNativePdf} disabled={openingNative} title="Open in system viewer">
            {openingNative ? "…" : "⎋"}
          </button>
        </div>
      </div>

      {error ? (
        <div style={s.notice}>
          <h2 style={s.noticeTitle}>Could not render the PDF</h2>
          <p style={s.noticeText}>{error}</p>
          <button type="button" style={s.noticeButton} onClick={openNativePdf}>Open in system viewer</button>
        </div>
      ) : (
        <>
          <p style={s.progress}>
            {loadingDoc ? "Loading PDF…" : pageCount ? `Page ${pageLabel}` : "Loading PDF…"}
          </p>
          {!loadingDoc && (
            <p style={s.debug}>{renderStats || (pageCount ? "Rendering…" : "")}</p>
          )}
          <div
            style={s.reader}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <canvas ref={canvasRef} style={s.canvas} />
            {viewMode === "double" && (
              <canvas ref={canvas2Ref} style={s.canvas} />
            )}
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
  const workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
  try {
    GlobalWorkerOptions.workerPort = new Worker(workerSrc, { type: "module" });
  } catch {
    GlobalWorkerOptions.workerSrc = workerSrc;
  }
}

if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

const seg = {
  border: "2px solid var(--ink-000)",
  borderRadius: 8,
  overflow: "hidden",
  boxShadow: "2px 2px 0 var(--ink-000)",
  display: "flex",
};
const segBase = {
  padding: "5px 10px",
  border: 0,
  fontFamily: "var(--font-burst)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const s = {
  page: { width: "100%", maxWidth: 1040, margin: "0 auto" },
  toolbar: {
    position: "sticky",
    top: "calc(60px + env(safe-area-inset-top, 0px))",
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 0 14px",
    background: "var(--bg)",
    borderBottom: "2px solid var(--ink-000)",
    flexWrap: "wrap",
  },
  back: { fontFamily: "var(--font-burst)", fontSize: 14, letterSpacing: "0.1em", color: "var(--hero-gold)", textTransform: "uppercase" },
  titleWrap: { flex: 1, minWidth: 160 },
  source: { color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 },
  eyebrow: { fontFamily: "var(--font-burst)", fontSize: 11, letterSpacing: "0.14em", color: "var(--hero-cyan)", textTransform: "uppercase" },
  title: { fontFamily: "var(--font-serif)", fontSize: 20, lineHeight: 1.15, margin: 0 },
  controls: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  seg,
  segOn:  { ...segBase, background: "var(--hero-gold)", color: "var(--bg)" },
  segOff: { ...segBase, background: "var(--bg-card)",   color: "var(--text-soft)" },
  iconBtn: { width: 32, height: 32, border: "2px solid var(--ink-000)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text)", boxShadow: "2px 2px 0 var(--ink-000)", fontWeight: 800, fontSize: 16, cursor: "pointer" },
  zoom: { minWidth: 42, textAlign: "center", color: "var(--text-soft)", fontSize: 12, fontFamily: "var(--font-mono)" },
  navBtn: { width: 34, height: 34, border: "2px solid var(--ink-000)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text)", boxShadow: "2px 2px 0 var(--ink-000)", fontSize: 22, lineHeight: "30px", textAlign: "center", cursor: "pointer" },
  pagePill: { minHeight: 32, display: "inline-flex", alignItems: "center", padding: "0 10px", border: "2px solid var(--ink-000)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-soft)", boxShadow: "2px 2px 0 var(--ink-000)", fontFamily: "var(--font-mono)", fontSize: 12, whiteSpace: "nowrap" },
  fallbackBtn: { padding: "0 8px", height: 32, border: "2px solid var(--ink-000)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-soft)", boxShadow: "2px 2px 0 var(--ink-000)", fontSize: 14, cursor: "pointer" },
  progress: { margin: "14px 0 4px", color: "var(--text-soft)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" },
  debug: { margin: "0 0 10px", color: "var(--text-faint)", fontSize: 11 },
  reader: {
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 8,
    paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
    overflowX: "auto",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "pan-y",
  },
  canvas: { display: "block", flexShrink: 0, background: "#fff", border: "2px solid var(--ink-000)", boxShadow: "4px 4px 0 var(--ink-000)", borderRadius: 4 },
  notice: { marginTop: 24, padding: 18, background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 10, boxShadow: "3px 3px 0 var(--ink-000)" },
  noticeTitle: { fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8 },
  noticeText: { color: "var(--text-soft)", marginBottom: 14 },
  noticeButton: { color: "var(--hero-gold)", fontWeight: 700, background: "transparent", border: 0, padding: 0, cursor: "pointer" },
};
