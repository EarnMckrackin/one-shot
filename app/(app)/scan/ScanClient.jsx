"use client";
import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase-browser";
import InkButton from "../../../components/InkButton";

const MODES = ["Camera", "Upload Image", "Upload PDF"];
const MAJOR_PUBLISHERS = [
  "Marvel",
  "DC",
  "Image",
  "Dark Horse",
  "IDW",
  "BOOM! Studios",
  "Dynamite",
  "Valiant",
  "Archie",
  "Oni Press",
  "Titan",
  "Vault",
  "Mad Cave",
  "Skybound",
  "DSTLRY",
  "Other",
];

export default function ScanClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const replaceId    = searchParams.get("replace");
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
  const [manualQuery, setManualQuery] = useState("");
  const [searching, setSearching]     = useState(false);
  const [publisherChoice, setPublisherChoice] = useState("");
  const [customPublisher, setCustomPublisher] = useState("");

  function selectedPublisher() {
    return publisherChoice === "Other" ? customPublisher.trim() : publisherChoice;
  }

  function syncPublisher(value) {
    const publisher = value?.trim() || "";
    if (!publisher) {
      setPublisherChoice("");
      setCustomPublisher("");
      return;
    }
    if (MAJOR_PUBLISHERS.includes(publisher)) {
      setPublisherChoice(publisher);
      setCustomPublisher("");
      return;
    }
    setPublisherChoice("Other");
    setCustomPublisher(publisher);
  }

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
    const MAX    = 900;
    const scale  = Math.min(1, MAX / Math.max(video.videoWidth, video.videoHeight));
    canvas.width  = Math.round(video.videoWidth  * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  }

  async function scanImage(base64) {
    setScanning(true);
    setResults([]);
    try {
      const res  = await fetch("/api/scan", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ imageBase64: base64, mimeType: "image/jpeg", publisher: selectedPublisher() || undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setExtracted(data.extracted);
      setResults(data.results ?? []);
      syncPublisher(data.extracted?.publisher);
      const q = [data.extracted?.series, data.extracted?.issue && `#${data.extracted.issue}`].filter(Boolean).join(" ");
      setManualQuery(q);
    } catch (e) {
      alert("Scan failed: " + e.message);
    } finally {
      setScanning(false);
    }
  }

  async function searchManually(e) {
    e.preventDefault();
    if (!manualQuery.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const res  = await fetch("/api/scan", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ query: manualQuery.trim(), publisher: selectedPublisher() || undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results ?? []);
    } catch (e) {
      alert("Search failed: " + e.message);
    } finally {
      setSearching(false);
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
      if (result.series_name || result.publisher || selectedPublisher()) {
        const pubName = selectedPublisher() || result.publisher || "Unknown";
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

      if (replaceId) {
        const { error } = await supabase.from("comics").update({
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
        }).eq("id", replaceId);
        if (error) throw error;
        router.push(`/comic/${replaceId}`);
        return;
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
      const publisher = selectedPublisher();

      if (publisher) {
        const { data: pub } = await supabase
          .from("publishers")
          .upsert({ user_id: user.id, name: publisher }, { onConflict: "user_id,name" })
          .select("id").single();
        publisherId = pub?.id;
      }

      if (pdfDetails.series) {
        const { data: ser } = await supabase
          .from("series")
          .upsert({ user_id: user.id, publisher_id: publisherId, name: pdfDetails.series }, { onConflict: "user_id,name" })
          .select("id").single();
        seriesId = ser?.id;
      }

      const { data: comic, error } = await supabase.from("comics").insert({
        user_id:      user.id,
        series_id:    seriesId,
        publisher_id: publisherId,
        title:        pdfDetails.title || pdfFile.name.replace(".pdf", ""),
        issue_number: pdfDetails.issue || null,
        has_pdf:      false,
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
      {replaceId && <Link href={`/comic/${replaceId}`} style={{ color: "var(--text-faint)", fontSize: 13, display: "inline-block", marginBottom: 16 }}>← Back to comic</Link>}
      <h1 style={s.title}>{replaceId ? "Re-identify Cover" : "Scan Cover"}</h1>

      <div style={s.modeBar}>
        {MODES.map((m) => (
          <button key={m} style={{ ...s.chip, ...(mode === m ? s.chipActive : {}) }}
            onClick={() => { setMode(m); setResults([]); setExtracted(null); if (streaming) stopCamera(); }}>
            {m}
          </button>
        ))}
      </div>

      <PublisherPicker
        publisherChoice={publisherChoice}
        customPublisher={customPublisher}
        onPublisherChoice={setPublisherChoice}
        onCustomPublisher={setCustomPublisher}
      />

      {/* Camera mode */}
      {mode === "Camera" && !results.length && (
        <div style={s.cameraSection}>
          <div style={s.viewfinder}>
            <video ref={videoRef} style={s.video} playsInline muted />
            {streaming && <div style={s.scanFrame} />}
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {!streaming ? (
            <InkButton size="lg" onClick={startCamera}>Start Camera</InkButton>
          ) : (
            <InkButton size="lg" onClick={handleCaptureClick} disabled={scanning}>
              {scanning ? "Scanning…" : "Capture & Identify"}
            </InkButton>
          )}
          <p style={s.hint}>Point the camera at a comic cover and tap Capture</p>
        </div>
      )}

      {/* Image upload */}
      {mode === "Upload Image" && !results.length && (
        <div style={s.uploadSection}>
          <label style={s.uploadLabel}>
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
            <InkButton as="span" size="lg">{scanning ? "Scanning…" : "Choose Image"}</InkButton>
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
          <input className="ink-input" placeholder="Title (e.g. Amazing Spider-Man)" value={pdfDetails.title} onChange={(e) => setPdfDetails({ ...pdfDetails, title: e.target.value })} />
          <input className="ink-input" placeholder="Issue # (e.g. 42)" value={pdfDetails.issue} onChange={(e) => setPdfDetails({ ...pdfDetails, issue: e.target.value })} />
          <input className="ink-input" placeholder="Series name" value={pdfDetails.series} onChange={(e) => setPdfDetails({ ...pdfDetails, series: e.target.value })} />
          <p style={s.hint}>PDF will be uploaded to your Google Drive and linked to this comic.</p>
          <InkButton type="submit" size="lg" disabled={!pdfFile || adding}>
            {adding ? "Uploading…" : "Add to Library"}
          </InkButton>
        </form>
      )}

      {/* Scanning spinner */}
      {scanning && (
        <p style={{ color: "var(--text-soft)", textAlign: "center", padding: 32 }}>Identifying cover with AI…</p>
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
      {results.length > 0 && !scanning && !searching && (
        <div>
          <h2 style={s.resultsHeader}>{replaceId ? "Select the correct match — this will update your comic" : "Select the correct issue"}</h2>
          <div style={s.resultsList}>
            {results.map((r, i) => (
              <button key={r.comicvine_id ?? r.metron_id ?? i} style={s.resultRow} onClick={() => addComicToLibrary(r)} disabled={adding}>
                {r.cover_url && <img src={r.cover_url} alt={r.title} style={s.resultCover} />}
                <div style={{ textAlign: "left" }}>
                  <p style={s.resultSeries}>{r.series_name}</p>
                  <p style={s.resultTitle}>{r.title} {r.issue_number ? `#${r.issue_number}` : ""}</p>
                  <p style={s.resultMeta}>
                    {[r.publisher, r.release_date, r.source].filter(Boolean).join(" · ")}
                    {Number.isFinite(r.match_score) ? ` · Match ${Math.max(0, Math.round(r.match_score))}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual search — shown after any scan or when results are empty */}
      {(extracted || results.length > 0 || (!scanning && !searching && manualQuery)) && (
        <div style={s.manualSearch}>
          <p style={s.manualLabel}>Not finding it? Search by title and issue number:</p>
          <form onSubmit={searchManually} style={s.manualForm}>
            <input
              className="ink-input"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="e.g. Amazing Spider-Man #300"
              style={s.manualInput}
            />
            <InkButton type="submit" size="md" disabled={searching || !manualQuery.trim()}>
              {searching ? "…" : "Search"}
            </InkButton>
          </form>
          <InkButton variant="ghost" size="sm" onClick={() => { setResults([]); setExtracted(null); setManualQuery(""); }}>Start over</InkButton>
        </div>
      )}
    </div>
  );
}

function PublisherPicker({ publisherChoice, customPublisher, onPublisherChoice, onCustomPublisher }) {
  return (
    <div style={s.publisherBox}>
      <label style={s.publisherLabel} htmlFor="publisher-select">Publisher</label>
      <select
        id="publisher-select"
        className="ink-input"
        value={publisherChoice}
        onChange={(e) => onPublisherChoice(e.target.value)}
        style={s.publisherSelect}
      >
        <option value="">Auto / Unknown</option>
        {MAJOR_PUBLISHERS.map((publisher) => (
          <option key={publisher} value={publisher}>{publisher}</option>
        ))}
      </select>
      {publisherChoice === "Other" && (
        <input
          className="ink-input"
          placeholder="Publisher name"
          value={customPublisher}
          onChange={(e) => onCustomPublisher(e.target.value)}
          style={s.publisherCustom}
        />
      )}
    </div>
  );
}

const s = {
  page:          { maxWidth: 600, margin: "0 auto" },
  title:         { fontSize: 32, fontFamily: "var(--font-serif)", fontWeight: 700, marginBottom: 20, letterSpacing: "-0.02em" },
  modeBar:       { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
  chip:          { padding: "8px 16px 6px", borderRadius: 999, background: "var(--bg-card)", border: "2px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)", color: "var(--text-soft)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-burst)", letterSpacing: "0.1em", textTransform: "uppercase" },
  chipActive:    { background: "var(--accent)", color: "#fff", transform: "rotate(-1.5deg)", backgroundImage: "var(--hatch-dark)" },
  publisherBox:  { display: "grid", gridTemplateColumns: "auto minmax(180px, 260px)", alignItems: "center", gap: 10, marginBottom: 24 },
  publisherLabel:{ color: "var(--hero-gold)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-burst)" },
  publisherSelect: { minHeight: 42 },
  publisherCustom: { gridColumn: "2 / 3" },
  cameraSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  viewfinder:    { width: "100%", maxWidth: 320, aspectRatio: "2/3", background: "var(--bg-surface)", borderRadius: 12, overflow: "hidden", position: "relative", border: "2px solid var(--ink-000)", boxShadow: "4px 4px 0 var(--ink-000)" },
  video:         { width: "100%", height: "100%", objectFit: "cover" },
  scanFrame:     { position: "absolute", inset: "10%", border: "2px solid var(--accent)", borderRadius: 8, pointerEvents: "none", boxShadow: "0 0 0 2px rgba(239,43,61,0.2)" },
  hint:          { color: "var(--text-faint)", fontSize: 13, textAlign: "center" },
  uploadSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 0" },
  uploadLabel:   { cursor: "pointer" },
  pdfForm:       { display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 },
  uploadBtn:     { display: "inline-block", background: "var(--bg-card)", border: "2px solid var(--ink-000)", color: "var(--text)", padding: "12px 20px", borderRadius: 10, cursor: "pointer", fontWeight: 600, boxShadow: "2px 2px 0 var(--ink-000)" },
  extracted:     { background: "var(--bg-card)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, border: "2px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)" },
  extractedLabel: { color: "var(--text-faint)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-burst)" },
  extractedValue: { color: "var(--text)", fontWeight: 600 },
  resultsHeader: { fontSize: 16, fontWeight: 700, marginBottom: 12, color: "var(--text-soft)", fontFamily: "var(--font-display)", letterSpacing: "0.03em", textTransform: "uppercase" },
  resultsList:   { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  resultRow:     { display: "flex", gap: 14, background: "var(--bg-card)", borderRadius: 12, overflow: "hidden", border: "2px solid var(--ink-000)", boxShadow: "3px 3px 0 var(--ink-000)", cursor: "pointer", textAlign: "left", padding: "10px 14px 10px 0", alignItems: "center" },
  resultCover:   { width: 60, height: 90, objectFit: "cover", flexShrink: 0 },
  resultSeries:  { color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  resultTitle:   { color: "var(--text)", fontSize: 15, fontWeight: 600, marginTop: 2 },
  resultMeta:    { color: "var(--text-faint)", fontSize: 12, marginTop: 4 },
  manualSearch:  { marginTop: 20, borderTop: "2px solid var(--ink-000)", paddingTop: 20 },
  manualLabel:   { color: "var(--text-faint)", fontSize: 13, marginBottom: 10 },
  manualForm:    { display: "flex", gap: 8, marginBottom: 12 },
  manualInput:   { flex: 1 },
};
