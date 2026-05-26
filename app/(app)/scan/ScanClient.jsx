"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase-browser";
import InkButton from "../../../components/InkButton";
import ComicCover from "../../../components/ComicCover";
import { CapacitorPluginMlKitTextRecognition } from "@pantrist/capacitor-plugin-ml-kit-text-recognition";
import { saveLocalPdf } from "../../../lib/local-pdf-store";
import { upsertLocalLibraryComic } from "../../../lib/local-data-store";

const MODES = ["Search", "Camera", "Upload Image", "Upload PDF"];
const LOCAL_ADD_STATE_KEY = "oneshot:add-state:v1";
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
  const requestedMode = searchParams.get("mode");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [mode, setMode]         = useState("Search");
  const [streaming, setStreaming] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [results, setResults]   = useState([]);
  const [extracted, setExtracted] = useState(null);
  const [adding, setAdding]     = useState(false);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [pdfDetails, setPdfDetails] = useState({ title: "", issue: "", series: "" });
  const [pdfProgress, setPdfProgress] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [searching, setSearching]     = useState(false);
  const [publisherChoice, setPublisherChoice] = useState("");
  const [customPublisher, setCustomPublisher] = useState("");
  const [localCover, setLocalCover] = useState(null);
  const [ocrText, setOcrText] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [showOcrText, setShowOcrText] = useState(false);
  const [addedComic, setAddedComic] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_ADD_STATE_KEY) || "{}");
      if (saved.query) setManualQuery(saved.query);
      if (saved.publisherChoice) setPublisherChoice(saved.publisherChoice);
      if (saved.customPublisher) setCustomPublisher(saved.customPublisher);
      if (saved.coverDataUrl) setLocalCover(saved.coverDataUrl);
      if (saved.ocrText) setOcrText(saved.ocrText);
    } catch {}
  }, []);

  useEffect(() => {
    if (MODES.includes(requestedMode)) setMode(requestedMode);
  }, [requestedMode]);

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
    return canvas.toDataURL("image/jpeg", 0.78);
  }

  function saveLocalAddState(next = {}) {
    try {
      localStorage.setItem(LOCAL_ADD_STATE_KEY, JSON.stringify({
        query: manualQuery,
        publisherChoice,
        customPublisher,
        coverDataUrl: localCover,
        ocrText,
        savedAt: new Date().toISOString(),
        ...next,
      }));
    } catch {}
  }

  async function saveLocalCover(dataUrl) {
    setAddedComic(null);
    setLocalCover(dataUrl);
    saveLocalAddState({ coverDataUrl: dataUrl });
    setResults([]);
    setExtracted(null);
    setMode("Search");
    await runOcr(dataUrl);
  }

  async function runOcr(dataUrl) {
    setScanning(true);
    setOcrStatus("Reading cover text on device...");
    try {
      const result = await CapacitorPluginMlKitTextRecognition.detectText({
        base64Image: dataUrl.split(",")[1] || dataUrl,
        rotation: 0,
      });
      const cleaned = cleanOcrText(result.text);
      const query = buildQueryFromOcr(cleaned);
      setOcrText(cleaned);
      saveLocalAddState({ ocrText: cleaned, query });
      if (query && !manualQuery.trim()) {
        setManualQuery(query);
        autoSearch(query);
      }
      setOcrStatus(cleaned ? "Cover text read. Searching..." : "No readable cover text found. Try manual search.");
    } catch {
      setOcrStatus("OCR runs in the Android/iOS app. Use manual search in this browser.");
    } finally {
      setScanning(false);
    }
  }

  async function autoSearch(query) {
    if (!query?.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: query.trim(), publisher: selectedPublisher() || undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results ?? []);
      setMode("Search");
    } catch (e) {
      setOcrStatus("Search failed: " + e.message);
    } finally {
      setSearching(false);
    }
  }

  async function searchManually(e) {
    e.preventDefault();
    if (!manualQuery.trim()) return;
    setAddedComic(null);
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
      saveLocalAddState({ query: manualQuery.trim() });
      setResults(data.results ?? []);
    } catch (e) {
      alert("Search failed: " + e.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleCaptureClick() {
    const dataUrl = await captureFrame();
    stopCamera();
    await saveLocalCover(dataUrl);
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      await saveLocalCover(ev.target.result);
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
        const updated = await fetchLibraryComic(replaceId);
        if (updated) upsertLocalLibraryComic(updated);
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
      const saved = await fetchLibraryComic(comic.id);
      if (saved) upsertLocalLibraryComic(saved);
      saveLocalAddState({ query: "", coverDataUrl: null, ocrText: "" });
      setAddedComic({ id: comic.id, result, seriesName: result.series_name });
      setManualQuery("");
      setLocalCover(null);
      setOcrText("");
      setOcrStatus("");
      setResults([]);
    } catch (e) {
      alert("Error adding comic: " + e.message);
    } finally {
      setAdding(false);
    }
  }

  async function fetchLibraryComic(id) {
    const { data, error } = await supabase
      .from("comics")
      .select("id, title, issue_number, cover_url, has_pdf, drive_file_id, release_date, created_at, comicvine_id, series:series_id(id, name), publisher:publisher_id(id, name), reading_log(id)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data ? { ...data, read_count: data.reading_log?.length ?? 0 } : null;
  }

  async function uploadToDriveIfConnected(comicId, file, index, total, setProgress) {
    try {
      const statusRes = await fetch("/api/google/status");
      if (!statusRes.ok) return;
      const { connected } = await statusRes.json();
      if (!connected) return;

      setProgress(`Syncing to Google Drive (${index + 1} of ${total})…`);

      const sessionRes = await fetch("/api/google/upload-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, fileSize: file.size }),
      });
      if (!sessionRes.ok) return;
      const { uploadUrl } = await sessionRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: file,
      });
      if (!uploadRes.ok) return;

      const uploaded = await uploadRes.json();
      if (!uploaded.id) return;

      await fetch("/api/google/upload-complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          comicId,
          drive_file_id:  uploaded.id,
          drive_view_url: uploaded.webViewLink ?? null,
        }),
      });
    } catch {
      // Drive sync failure is non-fatal; PDF is already saved locally
    }
  }

  async function handlePDFSubmit(e) {
    e.preventDefault();
    if (!pdfFiles.length) return;
    setAdding(true);
    setPdfProgress("");
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

      let lastComicId = null;
      for (const [index, file] of pdfFiles.entries()) {
        setPdfProgress(`Uploading ${index + 1} of ${pdfFiles.length}: ${file.name}`);
        const singleFile = pdfFiles.length === 1;
        const { data: comic, error } = await supabase.from("comics").insert({
          user_id:      user.id,
          series_id:    seriesId,
          publisher_id: publisherId,
          title:        singleFile && pdfDetails.title ? pdfDetails.title : titleFromPdfName(file.name),
          issue_number: singleFile ? (pdfDetails.issue || null) : null,
          has_pdf:      true,
        }).select("id").single();

        if (error) throw error;
        lastComicId = comic.id;

        await saveLocalPdf(comic.id, file);
        await uploadToDriveIfConnected(comic.id, file, index, pdfFiles.length, setPdfProgress);
      }

      setPdfFiles([]);
      setPdfDetails({ title: "", issue: "", series: pdfDetails.series });
      router.push(pdfFiles.length === 1 && lastComicId ? `/comic/${lastComicId}` : "/library?format=PDF");
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setAdding(false);
      setPdfProgress("");
    }
  }

  return (
    <div style={s.page}>
      {replaceId && <Link href={`/comic/${replaceId}`} style={{ color: "var(--text-faint)", fontSize: 13, display: "inline-block", marginBottom: 16 }}>← Back to comic</Link>}
      <h1 style={s.title}>{replaceId ? "Re-identify Cover" : "Add Comics"}</h1>
      {replaceId && (
        <div style={s.replacePanel}>
          <p style={s.replaceTitle}>Repair mode</p>
          <p style={s.hint}>Matches selected here update the existing issue instead of creating a duplicate.</p>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: rotate(-4deg) scale(1); }
          50% { transform: rotate(-2deg) scale(1.1); }
        }
      `}</style>

      <div style={s.modeBar}>
        {MODES.map((m) => (
          <button key={m} style={{ ...s.chip, ...(mode === m ? s.chipActive : {}) }}
            onClick={() => { setMode(m); setResults([]); setExtracted(null); setAddedComic(null); if (streaming) stopCamera(); }}>
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

      <DraftPanel
        mode={mode}
        query={manualQuery}
        publisher={selectedPublisher()}
        hasCover={Boolean(localCover)}
        ocrText={ocrText}
        pdfFiles={pdfFiles}
        replaceId={replaceId}
      />

      {addedComic && (
        <div style={s.nextPanel}>
          <p style={s.nextTitle}>Added to library</p>
          <p style={s.nextMeta}>{addedComic.result.series_name || addedComic.result.title}{addedComic.result.issue_number ? ` #${addedComic.result.issue_number}` : ""}</p>
          <div style={s.nextActions}>
            <InkButton href={`/comic/${addedComic.id}`} size="sm">Open issue</InkButton>
            <InkButton href={`/comic/${addedComic.id}`} variant="ghost" size="sm">Attach PDF</InkButton>
            <InkButton href={`/comic/${addedComic.id}`} variant="ghost" size="sm">Mark read</InkButton>
            <InkButton href="/pull-list" variant="gold" size="sm">Pull list</InkButton>
            <InkButton href="/resurface?mode=catchup" variant="cyan" size="sm">Resurface arc</InkButton>
          </div>
        </div>
      )}

      {localCover && (
        <div style={s.localCoverBox}>
          <img src={localCover} alt="Saved cover reference" style={s.localCoverImg} />
          <div style={s.localCoverMeta}>
            <p style={s.localCoverTitle}>Cover saved on this device</p>
            <p style={s.hint}>{ocrStatus || "OCR will try to extract title and issue text on Android/iOS."}</p>
          </div>
          <button style={s.clearLocalBtn} onClick={() => { setLocalCover(null); setOcrText(""); setOcrStatus(""); saveLocalAddState({ coverDataUrl: null, ocrText: "" }); }}>Clear</button>
        </div>
      )}

      {ocrText && (
        <div style={s.ocrBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showOcrText ? 10 : 0 }}>
            <p style={s.manualLabel}>{showOcrText ? "Cover text (RAW)" : "Text found on cover"}</p>
            <button
              style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, fontFamily: "var(--font-burst)", textTransform: "uppercase", cursor: "pointer" }}
              onClick={() => setShowOcrText(!showOcrText)}
            >
              {showOcrText ? "Hide Raw Text" : "View Raw Text"}
            </button>
          </div>

          {showOcrText && (
            <>
              <textarea
                className="ink-input"
                value={ocrText}
                onChange={(e) => { setOcrText(e.target.value); saveLocalAddState({ ocrText: e.target.value }); }}
                rows={4}
                style={s.ocrText}
              />
              <InkButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  const query = buildQueryFromOcr(ocrText);
                  setManualQuery(query);
                  saveLocalAddState({ query });
                  autoSearch(query);
                }}
              >
                Re-scan for Search
              </InkButton>
            </>
          )}
        </div>
      )}

      {/* Search mode */}
      {mode === "Search" && !results.length && (
        <div style={s.searchSection}>
          <form onSubmit={searchManually} style={s.searchForm}>
            <input
              className="ink-input"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Search by title, series, issue, or publisher"
              style={s.manualInput}
            />
            <InkButton type="submit" size="lg" disabled={searching || !manualQuery.trim()}>
              {searching ? "Searching..." : "Search Comics"}
            </InkButton>
          </form>
          <p style={s.hint}>Find comics you own and add the matching issue to your library.</p>
        </div>
      )}

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
              {scanning ? "Saving..." : "Capture Cover"}
            </InkButton>
          )}
          <p style={s.hint}>Point the camera at a comic cover. OCR runs on device, then searches Comic Vine and Metron.</p>
        </div>
      )}

      {/* Image upload */}
      {mode === "Upload Image" && !results.length && (
        <div style={s.uploadSection}>
          <label style={s.uploadLabel}>
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
            <InkButton as="span" size="lg">Choose Image</InkButton>
          </label>
          <p style={s.hint}>Run on-device OCR from a cover image, then search by series and issue.</p>
        </div>
      )}

      {/* PDF upload */}
      {mode === "Upload PDF" && (
        <form onSubmit={handlePDFSubmit} style={s.pdfForm}>
          <label style={s.pdfLabel}>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => setPdfFiles(Array.from(e.target.files ?? []))}
              style={{ display: "none" }}
            />
            <span style={s.uploadBtn}>{pdfFiles.length ? `${pdfFiles.length} PDF${pdfFiles.length === 1 ? "" : "s"} selected` : "Choose PDF Files"}</span>
          </label>
          {pdfFiles.length > 0 && (
            <div style={s.pdfFileList}>
              {pdfFiles.map((file) => (
                <span key={`${file.name}-${file.size}`} style={s.pdfFileItem}>{file.name}</span>
              ))}
            </div>
          )}
          <input className="ink-input" placeholder="Title (single PDF only; otherwise file names are used)" value={pdfDetails.title} onChange={(e) => setPdfDetails({ ...pdfDetails, title: e.target.value })} disabled={pdfFiles.length > 1} />
          <input className="ink-input" placeholder="Issue # (single PDF only)" value={pdfDetails.issue} onChange={(e) => setPdfDetails({ ...pdfDetails, issue: e.target.value })} disabled={pdfFiles.length > 1} />
          <input className="ink-input" placeholder="Series name" value={pdfDetails.series} onChange={(e) => setPdfDetails({ ...pdfDetails, series: e.target.value })} />
          <p style={s.hint}>PDFs are saved on this device for offline reading. Google Drive sync can stay optional.</p>
          {pdfProgress && <p style={s.uploadProgress}>{pdfProgress}</p>}
          <InkButton type="submit" size="lg" disabled={!pdfFiles.length || adding}>
            {adding ? "Uploading…" : `Add ${pdfFiles.length || ""} to Library`}
          </InkButton>
        </form>
      )}

      {/* Scanning/Searching spinner */}
      {(scanning || searching) && (
        <div style={s.loadingContainer}>
          <div style={s.kraak}>SEARCHING!</div>
          <p style={{ color: "var(--text-soft)", textAlign: "center" }}>{ocrStatus || "Consulting the archives..."}</p>
        </div>
      )}

      {/* Extracted info */}
      {extracted && !scanning && (
        <div style={s.extracted}>
          <span style={s.extractedLabel}>Local: </span>
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
                <div style={s.resultCoverWrap}>
                  <ComicCover src={r.cover_url} alt={r.title} size="sm" />
                </div>
                <div style={{ textAlign: "left", flex: 1 }}>
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

      {/* Manual search — shown after saved covers or results for quick refinement */}
      {results.length > 0 && (
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
              {searching ? "..." : "Search"}
            </InkButton>
          </form>
          <InkButton variant="ghost" size="sm" onClick={() => { setResults([]); setExtracted(null); setManualQuery(""); setAddedComic(null); }}>Start over</InkButton>
        </div>
      )}
    </div>
  );
}

function DraftPanel({ mode, query, publisher, hasCover, ocrText, pdfFiles, replaceId }) {
  const rows = [
    ["Mode", replaceId ? "Replacement" : mode],
    ["Query", query || "No search query yet"],
    ["Publisher", publisher || "Auto / Unknown"],
    ["Cover", hasCover ? "Staged on this device" : "No cover staged"],
    ["OCR", ocrText ? `${ocrText.split(/\r?\n/).filter(Boolean).length} text lines saved` : "No OCR text saved"],
    ["PDF", pdfFiles.length ? `${pdfFiles.length} selected` : "No PDF selected"],
  ];

  return (
    <div style={s.draftPanel}>
      <p style={s.draftTitle}>Draft state</p>
      <div style={s.draftGrid}>
        {rows.map(([label, value]) => (
          <div key={label} style={s.draftItem}>
            <span style={s.draftLabel}>{label}</span>
            <span style={s.draftValue}>{value}</span>
          </div>
        ))}
      </div>
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

function cleanOcrText(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\$?\d+(\.\d{2})?$/.test(line))
    .slice(0, 12)
    .join("\n");
}

function buildQueryFromOcr(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const issueLine = lines.find((line) => /#\s*\d+/i.test(line) || /\b(issue|no\.?)\s*#?\s*\d+/i.test(line));
  const issue = issueLine?.match(/#\s*([0-9]+[a-z]?)/i)?.[1]
    ?? issueLine?.match(/\b(?:issue|no\.?)\s*#?\s*([0-9]+[a-z]?)/i)?.[1];
  const title = lines
    .filter((line) => line.length > 2)
    .filter((line) => !/\b(marvel|dc|image|dark horse|idw|boom|dynamite|valiant|variant|cover|rated|legacy|barcode)\b/i.test(line))
    .sort((a, b) => b.length - a.length)[0] ?? lines[0] ?? "";
  return [title, issue && `#${issue}`].filter(Boolean).join(" ").trim();
}

function titleFromPdfName(filename) {
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Untitled PDF";
}

const s = {
  page:          { maxWidth: "var(--content-max-sm)", margin: "0 auto" },
  title:         { fontSize: 32, fontFamily: "var(--font-serif)", fontWeight: 700, marginBottom: 20, letterSpacing: "-0.02em" },
  replacePanel:  { background: "var(--bg-surface)", border: "2px solid var(--hero-gold)", borderRadius: 12, padding: 14, marginBottom: 18, boxShadow: "2px 2px 0 var(--ink-000)" },
  replaceTitle:  { color: "var(--hero-gold)", fontFamily: "var(--font-burst)", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 14, marginBottom: 4 },
  modeBar:       { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
  chip:          { padding: "8px 16px 6px", borderRadius: 999, background: "var(--bg-card)", border: "2px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)", color: "var(--text-soft)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-burst)", letterSpacing: "0.1em", textTransform: "uppercase" },
  chipActive:    { background: "var(--accent)", color: "#fff", transform: "rotate(-1.5deg)", backgroundImage: "var(--hatch-dark)" },
  publisherBox:  { display: "grid", gridTemplateColumns: "auto minmax(180px, min(360px, 60vw))", alignItems: "center", gap: 10, marginBottom: 24 },
  publisherLabel:{ color: "var(--hero-gold)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-burst)" },
  publisherSelect: { minHeight: 42 },
  publisherCustom: { gridColumn: "2 / 3" },
  draftPanel:    { background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 12, padding: 14, marginBottom: 18, boxShadow: "2px 2px 0 var(--ink-000)" },
  draftTitle:    { color: "var(--hero-gold)", fontFamily: "var(--font-burst)", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 14, marginBottom: 10 },
  draftGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 },
  draftItem:     { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", minWidth: 0 },
  draftLabel:    { display: "block", color: "var(--text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 },
  draftValue:    { display: "block", color: "var(--text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  nextPanel:     { background: "var(--bg-surface)", border: "3px solid var(--ink-000)", borderRadius: 14, padding: 16, marginBottom: 20, boxShadow: "4px 4px 0 var(--ink-000)" },
  nextTitle:     { color: "var(--hero-cyan)", fontFamily: "var(--font-burst)", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 18 },
  nextMeta:      { color: "var(--text-soft)", fontSize: 14, marginTop: 4, marginBottom: 12 },
  nextActions:   { display: "flex", gap: 8, flexWrap: "wrap" },
  localCoverBox: { display: "flex", alignItems: "center", gap: 12, background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 12, padding: 10, marginBottom: 18, boxShadow: "2px 2px 0 var(--ink-000)" },
  localCoverImg: { width: "clamp(54px, 7vw, 84px)", aspectRatio: "2/3", objectFit: "cover", borderRadius: 6, flexShrink: 0 },
  localCoverMeta: { flex: 1, minWidth: 0 },
  localCoverTitle: { color: "var(--text)", fontSize: 13, fontWeight: 700, marginBottom: 3 },
  clearLocalBtn: { background: "transparent", border: "1.5px solid var(--ink-000)", borderRadius: 8, color: "var(--text-faint)", cursor: "pointer", padding: "6px 10px", fontSize: 12 },
  ocrBox:        { background: "var(--bg-surface)", border: "2px solid var(--ink-000)", borderRadius: 12, padding: 14, marginBottom: 18, boxShadow: "2px 2px 0 var(--ink-000)" },
  ocrText:       { width: "100%", resize: "vertical", marginBottom: 10, fontFamily: "var(--font-mono)", fontSize: 12 },
  loadingContainer: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 20 },
  kraak: {
    fontFamily: "var(--font-burst)",
    fontSize: 48,
    color: "var(--hero-gold)",
    textShadow: "4px 4px 0 var(--ink-000), -2px -2px 0 var(--accent)",
    transform: "rotate(-4deg) scale(1.1)",
    animation: "pulse 1.5s infinite ease-in-out",
  },
  cameraSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  viewfinder:    { width: "100%", maxWidth: "min(420px, 72vw)", aspectRatio: "2/3", background: "var(--bg-surface)", borderRadius: 12, overflow: "hidden", position: "relative", border: "2px solid var(--ink-000)", boxShadow: "4px 4px 0 var(--ink-000)" },
  video:         { width: "100%", height: "100%", objectFit: "cover" },
  scanFrame:     { position: "absolute", inset: "10%", border: "2px solid var(--accent)", borderRadius: 8, pointerEvents: "none", boxShadow: "0 0 0 2px rgba(239,43,61,0.2)" },
  hint:          { color: "var(--text-faint)", fontSize: 13, textAlign: "center" },
  uploadSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 0" },
  uploadLabel:   { cursor: "pointer" },
  pdfForm:       { display: "flex", flexDirection: "column", gap: 12, maxWidth: "min(620px, 100%)" },
  pdfFileList:   { display: "flex", flexDirection: "column", gap: 6, maxHeight: 140, overflow: "auto", padding: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8 },
  pdfFileItem:   { color: "var(--text-soft)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  uploadProgress:{ color: "var(--hero-gold)", fontSize: 12, fontWeight: 700 },
  uploadBtn:     { display: "inline-block", background: "var(--bg-card)", border: "2px solid var(--ink-000)", color: "var(--text)", padding: "12px 20px", borderRadius: 10, cursor: "pointer", fontWeight: 600, boxShadow: "2px 2px 0 var(--ink-000)" },
  extracted:     { background: "var(--bg-card)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, border: "2px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)" },
  extractedLabel: { color: "var(--text-faint)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-burst)" },
  extractedValue: { color: "var(--text)", fontWeight: 600 },
  resultsHeader: { fontSize: 16, fontWeight: 700, marginBottom: 12, color: "var(--text-soft)", fontFamily: "var(--font-display)", letterSpacing: "0.03em", textTransform: "uppercase" },
  resultsList:   { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  resultRow:     { display: "flex", gap: 14, background: "var(--bg-card)", borderRadius: 12, overflow: "hidden", border: "2px solid var(--ink-000)", boxShadow: "3px 3px 0 var(--ink-000)", cursor: "pointer", textAlign: "left", padding: "10px 14px", alignItems: "center" },
  resultCoverWrap: { width: "clamp(60px, 8vw, 96px)", flexShrink: 0 },
  resultSeries:  { color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  resultTitle:   { color: "var(--text)", fontSize: 15, fontWeight: 600, marginTop: 2 },
  resultMeta:    { color: "var(--text-faint)", fontSize: 12, marginTop: 4 },
  manualSearch:  { marginTop: 20, borderTop: "2px solid var(--ink-000)", paddingTop: 20 },
  manualLabel:   { color: "var(--text-faint)", fontSize: 13, marginBottom: 10 },
  manualForm:    { display: "flex", gap: 8, marginBottom: 12 },
  manualInput:   { flex: 1 },
};
