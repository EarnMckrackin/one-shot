"use client";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
import { C } from "../../../lib/theme";

const MODES = ["Camera", "Upload Image", "Upload PDF"];

export default function ScanClient() {
  const router   = useRouter();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [mode, setMode]         = useState("Camera");
  const [streaming, setStreaming] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [results, setResults]   = useState([]);
  const [extracted, setExtracted] = useState(null);
  const [adding, setAdding]     = useState(false);
  const [pdfFile, setPdfFile]   = useState(null);
  const [pdfDetails, setPdfDetails] = useState({ title: "", issue: "", series: "" });

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStreaming(true);
    } catch (e) {
      alert("Camera access denied or unavailable");
    }
  }

  function stopCamera() {
    videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop());
    setStreaming(false);
  }

  async function captureFrame() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }

  async function scanImage(base64) {
    setScanning(true);
    setResults([]);
    try {
      const res  = await fetch("/api/scan", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ imageBase64: base64, mimeType: "image/jpeg" }),
      });
      const data = await res.json();
      setExtracted(data.extracted);
      setResults(data.results ?? []);
    } catch (e) {
      alert("Scan failed: " + e.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleCaptureClick() {
    const b64 = await captureFrame();
    stopCamera();
    await scanImage(b64);
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = ev.target.result.split(",")[1];
      await scanImage(b64);
    };
    reader.readAsDataURL(file);
  }

  async function addComicToLibrary(result) {
    setAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let publisherId = null;
      if (result.series_name || result.publisher) {
        const pubName = result.publisher ?? "Unknown";
        const { data: pub } = await supabase
          .from("publishers")
          .upsert({ user_id: user.id, name: pubName }, { onConflict: "user_id,name" })
          .select("id").single();
        publisherId = pub?.id;
      }

      let seriesId = null;
      if (result.series_name) {
        const { data: ser } = await supabase
          .from("series")
          .upsert({ user_id: user.id, publisher_id: publisherId, name: result.series_name, comicvine_id: result.comicvine_id?.slice(0, 8) ?? null, cover_url: result.cover_url }, { onConflict: "user_id,name" })
          .select("id").single();
        seriesId = ser?.id;
      }

      const { data: comic, error } = await supabase.from("comics").insert({
        user_id:      user.id,
        series_id:    seriesId,
        publisher_id: publisherId,
        title:        result.title,
        issue_number: result.issue_number,
        comicvine_id: result.comicvine_id,
        cover_url:    result.cover_url,
        description:  result.description,
        release_date: result.release_date,
        writers:      result.writers,
        artists:      result.artists,
        characters:   result.characters,
      }).select("id").single();

      if (error) throw error;
      router.push(`/comic/${comic.id}`);
    } catch (e) {
      alert("Error adding comic: " + e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handlePDFSubmit(e) {
    e.preventDefault();
    if (!pdfFile) return;
    setAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let publisherId = null;
      let seriesId    = null;

      if (pdfDetails.series) {
        const { data: ser } = await supabase
          .from("series")
          .upsert({ user_id: user.id, name: pdfDetails.series }, { onConflict: "user_id,name" })
          .select("id").single();
        seriesId = ser?.id;
      }

      const { data: comic, error } = await supabase.from("comics").insert({
        user_id:      user.id,
        series_id:    seriesId,
        publisher_id: publisherId,
        title:        pdfDetails.title || pdfFile.name.replace(".pdf", ""),
        issue_number: pdfDetails.issue || null,
        has_pdf:      true,
      }).select("id").single();

      if (error) throw error;

      // Upload to Google Drive
      const fd = new FormData();
      fd.append("file",    pdfFile);
      fd.append("comicId", comic.id);

      const uploadRes = await fetch("/api/google/upload", { method: "POST", body: fd });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        if (err.error === "Google Drive not connected") {
          router.push(`/comic/${comic.id}?connectDrive=1`);
          return;
        }
        throw new Error(err.error);
      }

      router.push(`/comic/${comic.id}`);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={s.page}>
      <h1 style={s.title}>Scan Cover</h1>

      <div style={s.modeBar}>
        {MODES.map((m) => (
          <button key={m} style={{ ...s.chip, ...(mode === m ? s.chipActive : {}) }}
            onClick={() => { setMode(m); setResults([]); setExtracted(null); if (streaming) stopCamera(); }}>
            {m}
          </button>
        ))}
      </div>

      {/* Camera mode */}
      {mode === "Camera" && !results.length && (
        <div style={s.cameraSection}>
          <div style={s.viewfinder}>
            <video ref={videoRef} style={s.video} playsInline muted />
            {streaming && <div style={s.scanFrame} />}
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {!streaming ? (
            <button style={s.primaryBtn} onClick={startCamera}>Start Camera</button>
          ) : (
            <button style={s.primaryBtn} onClick={handleCaptureClick} disabled={scanning}>
              {scanning ? "Scanning…" : "Capture & Identify"}
            </button>
          )}
          <p style={s.hint}>Point the camera at a comic cover and tap Capture</p>
        </div>
      )}

      {/* Image upload */}
      {mode === "Upload Image" && !results.length && (
        <div style={s.uploadSection}>
          <label style={s.uploadLabel}>
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
            <span style={s.primaryBtn}>{scanning ? "Scanning…" : "Choose Image"}</span>
          </label>
          <p style={s.hint}>Upload a photo of a comic cover to identify it</p>
        </div>
      )}

      {/* PDF upload */}
      {mode === "Upload PDF" && (
        <form onSubmit={handlePDFSubmit} style={s.pdfForm}>
          <label style={s.pdfLabel}>
            <input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0])} style={{ display: "none" }} />
            <span style={s.uploadBtn}>{pdfFile ? pdfFile.name : "Choose PDF File"}</span>
          </label>
          <input placeholder="Title (e.g. Amazing Spider-Man)" value={pdfDetails.title} onChange={(e) => setPdfDetails({ ...pdfDetails, title: e.target.value })} />
          <input placeholder="Issue # (e.g. 42)" value={pdfDetails.issue} onChange={(e) => setPdfDetails({ ...pdfDetails, issue: e.target.value })} />
          <input placeholder="Series name" value={pdfDetails.series} onChange={(e) => setPdfDetails({ ...pdfDetails, series: e.target.value })} />
          <p style={s.hint}>PDF will be uploaded to your Google Drive and linked to this comic.</p>
          <button type="submit" style={s.primaryBtn} disabled={!pdfFile || adding}>
            {adding ? "Uploading…" : "Add to Library"}
          </button>
        </form>
      )}

      {/* Scanning spinner */}
      {scanning && (
        <p style={{ color: C.textSoft, textAlign: "center", padding: 32 }}>Identifying cover with AI…</p>
      )}

      {/* Extracted info */}
      {extracted && !scanning && (
        <div style={s.extracted}>
          <span style={s.extractedLabel}>Detected: </span>
          <span style={s.extractedValue}>
            {[extracted.series, extracted.issue && `#${extracted.issue}`, extracted.publisher].filter(Boolean).join("  ·  ")}
          </span>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <h2 style={s.resultsHeader}>Select the correct issue</h2>
          <div style={s.resultsList}>
            {results.map((r) => (
              <button key={r.comicvine_id} style={s.resultRow} onClick={() => addComicToLibrary(r)} disabled={adding}>
                {r.cover_url && <img src={r.cover_url} alt={r.title} style={s.resultCover} />}
                <div style={{ textAlign: "left" }}>
                  <p style={s.resultSeries}>{r.series_name}</p>
                  <p style={s.resultTitle}>{r.title} {r.issue_number ? `#${r.issue_number}` : ""}</p>
                  <p style={s.resultMeta}>{r.release_date}</p>
                </div>
              </button>
            ))}
          </div>
          <button style={s.ghostBtn} onClick={() => { setResults([]); setExtracted(null); }}>Start over</button>
        </div>
      )}
    </div>
  );
}

const s = {
  page:          { maxWidth: 600, margin: "0 auto" },
  title:         { fontSize: 32, fontFamily: "Georgia, serif", fontWeight: 700, marginBottom: 20 },
  modeBar:       { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
  chip:          { padding: "7px 16px", borderRadius: 20, background: C.card, border: `1px solid ${C.border}`, color: C.textSoft, fontSize: 13, cursor: "pointer" },
  chipActive:    { background: C.accent, borderColor: C.accent, color: "#fff", fontWeight: 700 },
  cameraSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  viewfinder:    { width: "100%", maxWidth: 400, aspectRatio: "4/3", background: C.surface, borderRadius: 12, overflow: "hidden", position: "relative", border: `1px solid ${C.border}` },
  video:         { width: "100%", height: "100%", objectFit: "cover" },
  scanFrame:     { position: "absolute", inset: "10%", border: `2px solid ${C.accent}`, borderRadius: 8, pointerEvents: "none" },
  primaryBtn:    { background: C.accent, color: "#fff", padding: "13px 28px", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: "pointer", border: "none", display: "inline-block" },
  hint:          { color: C.textFaint, fontSize: 13, textAlign: "center" },
  uploadSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 0" },
  uploadLabel:   { cursor: "pointer" },
  pdfForm:       { display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 },
  uploadBtn:     { display: "inline-block", background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: "12px 20px", borderRadius: 10, cursor: "pointer", fontWeight: 600 },
  extracted:     { background: C.card, borderRadius: 10, padding: "12px 16px", marginBottom: 20, border: `1px solid ${C.border}` },
  extractedLabel: { color: C.textFaint, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  extractedValue: { color: C.text, fontWeight: 600 },
  resultsHeader: { fontSize: 16, fontWeight: 700, marginBottom: 12, color: C.textSoft },
  resultsList:   { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  resultRow:     { display: "flex", gap: 14, background: C.card, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, cursor: "pointer", textAlign: "left", padding: "10px 14px 10px 0", alignItems: "center" },
  resultCover:   { width: 60, height: 90, objectFit: "cover", flexShrink: 0 },
  resultSeries:  { color: C.textFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  resultTitle:   { color: C.text, fontSize: 15, fontWeight: 600, marginTop: 2 },
  resultMeta:    { color: C.textFaint, fontSize: 12, marginTop: 4 },
  ghostBtn:      { background: "none", border: `1px solid ${C.border}`, color: C.textSoft, padding: "10px 20px", borderRadius: 10, cursor: "pointer", fontSize: 14 },
};
