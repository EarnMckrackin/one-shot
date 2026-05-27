"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase-browser";
import InkButton from "../../../../components/InkButton";
import { removeLocalLibraryComic } from "../../../../lib/local-data-store";
import { saveLocalPdf } from "../../../../lib/local-pdf-store";

export default function ComicDetailClient({ comic: initial }) {
  const router = useRouter();
  const [comic, setComic]           = useState(initial);
  const [logOpen, setLogOpen]       = useState(false);
  const [schedOpen, setSchedOpen]   = useState(false);
  const [notes, setNotes]           = useState("");
  const [schedDate, setSchedDate]   = useState("");
  const [saving, setSaving]         = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [altCovers, setAltCovers]   = useState([]);
  const [fetchingCovers, setFetchingCovers] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState("");
  const [savingCover, setSavingCover] = useState(false);
  const [priorIssues, setPriorIssues] = useState([]);
  const [loadingPrior, setLoadingPrior] = useState(false);
  const [priorError, setPriorError] = useState(null);
  const [addingPrior, setAddingPrior] = useState(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [driveStatus, setDriveStatus] = useState(null); // null | "uploading" | "synced" | "no_drive"
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [driveFilesError, setDriveFilesError] = useState(null);
  const [linkingDriveFile, setLinkingDriveFile] = useState(null);

  const readLog   = comic.reading_log ?? [];
  const readCount = readLog.length;
  const lastRead  = readLog.sort((a, b) => new Date(b.read_at) - new Date(a.read_at))[0]?.read_at;

  useEffect(() => {
    if (comic.description || !comic.issue_number) return;

    let active = true;
    fetch("/api/comics/enrich", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ comicId: comic.id }),
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (active && data?.issue?.description) reload();
      })
      .catch(() => {});

    return () => { active = false; };
  }, [comic.description, comic.id, comic.issue_number]);

  useEffect(() => {
    if (!comic.series?.name || !comic.issue_number) return;

    const params = new URLSearchParams({
      series: comic.series.name,
      seriesId: comic.series.id,
      issue: comic.issue_number,
    });
    if (comic.publisher?.name) params.set("publisher", comic.publisher.name);

    let active = true;
    setLoadingPrior(true);
    setPriorError(null);

    fetch(`/api/series-history?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load series history");
        if (active) setPriorIssues(data.issues ?? []);
      })
      .catch((e) => {
        if (active) setPriorError(e.message);
      })
      .finally(() => {
        if (active) setLoadingPrior(false);
      });

    return () => { active = false; };
  }, [comic.id, comic.issue_number, comic.publisher?.name, comic.series?.id, comic.series?.name]);

  async function reload() {
    const { data } = await supabase
      .from("comics")
      .select("*, series:series_id( id, name ), publisher:publisher_id( id, name ), reading_log( id, read_at, notes )")
      .eq("id", comic.id)
      .single();
    if (data) setComic(data);
  }

  async function logReading() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("reading_log").insert({ user_id: user.id, comic_id: comic.id, notes: notes || null });
    setNotes("");
    setLogOpen(false);
    setSaving(false);
    reload();
  }

  async function addToSchedule() {
    if (!schedDate) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("reading_schedule").upsert(
      { user_id: user.id, comic_id: comic.id, scheduled_for: schedDate },
      { onConflict: "user_id,comic_id,scheduled_for" }
    );
    setSchedDate("");
    setSchedOpen(false);
    setSaving(false);
  }

  async function openCoverPicker() {
    setCoverPickerOpen(true);
    setAltCovers([]);
    setCustomCoverUrl("");
    setFetchingCovers(true);
    const query = [comic.series?.name ?? comic.title, comic.issue_number && `#${comic.issue_number}`]
      .filter(Boolean).join(" ");
    try {
      const res  = await fetch("/api/scan", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ query }),
      });
      const data = await res.json();
      const covers = (data.results ?? [])
        .filter(r => r.cover_url)
        .map(r => ({ url: r.cover_url, label: `${r.series_name ?? r.title}${r.issue_number ? ` #${r.issue_number}` : ""}` }));
      // Dedupe by URL
      const seen = new Set();
      setAltCovers(covers.filter(c => { if (seen.has(c.url)) return false; seen.add(c.url); return true; }));
    } catch {}
    setFetchingCovers(false);
  }

  async function saveCover(url) {
    if (!url?.trim()) return;
    setSavingCover(true);
    await supabase.from("comics").update({ cover_url: url }).eq("id", comic.id);
    setComic(c => ({ ...c, cover_url: url }));
    setCoverPickerOpen(false);
    setSavingCover(false);
  }

  async function handleDelete() {
    if (!confirm("Remove this comic from your library?")) return;
    await supabase.from("comics").delete().eq("id", comic.id);
    removeLocalLibraryComic(comic.id);
    router.push("/library");
  }

  async function attachPdf(file) {
    if (!file) return;
    setUploadingPdf(true);
    setPdfError(null);
    setDriveStatus(null);

    try {
      await saveLocalPdf(comic.id, file);
      const { error } = await supabase
        .from("comics")
        .update({ has_pdf: true })
        .eq("id", comic.id);
      if (error) throw error;
      setComic((current) => ({ ...current, has_pdf: true }));
    } catch (e) {
      setPdfError(e.message);
      setUploadingPdf(false);
      return;
    }

    setUploadingPdf(false);
    uploadToDrive(file);
  }

  async function uploadToDrive(file) {
    setDriveStatus("uploading");
    try {
      const filename = `${comic.title}${comic.issue_number ? ` #${comic.issue_number}` : ""}.pdf`
        .replace(/[^\w .#-]+/g, "").trim() || "comic.pdf";

      const sessionRes = await fetch("/api/google/upload-session", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ filename, fileSize: file.size }),
      });

      if (!sessionRes.ok) {
        const body = await sessionRes.json().catch(() => ({}));
        if (body.code === "not_connected") { setDriveStatus("no_drive"); return; }
        throw new Error(body.error || "Could not start Drive upload.");
      }

      const { uploadUrl } = await sessionRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method:  "PUT",
        headers: { "content-type": "application/pdf" },
        body:    file,
      });
      if (!uploadRes.ok) throw new Error(`Drive upload failed (${uploadRes.status}).`);

      const driveFile    = await uploadRes.json();
      const driveFileId  = driveFile.id;
      const driveViewUrl = driveFile.webViewLink ?? null;

      const completeRes = await fetch("/api/google/upload-complete", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ comicId: comic.id, drive_file_id: driveFileId, drive_view_url: driveViewUrl }),
      });
      if (!completeRes.ok) throw new Error("Could not save Drive file ID.");

      setComic((current) => ({ ...current, drive_file_id: driveFileId, drive_view_url: driveViewUrl }));
      setDriveStatus("synced");
    } catch (e) {
      setDriveStatus(null);
      setPdfError(`Drive sync failed: ${e.message}`);
    }
  }

  async function openDrivePicker() {
    setDrivePickerOpen(true);
    setDriveFiles([]);
    setDriveFilesError(null);
    setLoadingDriveFiles(true);
    try {
      const res = await fetch("/api/google/drive-files");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load Drive files.");
      setDriveFiles(data.files ?? []);
    } catch (e) {
      setDriveFilesError(e.message);
    } finally {
      setLoadingDriveFiles(false);
    }
  }

  async function linkDriveFile(driveFile) {
    setLinkingDriveFile(driveFile.id);
    try {
      const res = await fetch("/api/google/upload-complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comicId: comic.id, drive_file_id: driveFile.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Could not link Drive file.");
      }
      setComic((c) => ({ ...c, drive_file_id: driveFile.id, has_pdf: true }));
      setDrivePickerOpen(false);
      setDriveStatus("synced");
    } catch (e) {
      setPdfError(e.message);
    } finally {
      setLinkingDriveFile(null);
    }
  }

  async function addPriorIssue(issue) {
    const key = priorIssueKey(issue);
    setAddingPrior(key);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let publisherId = comic.publisher?.id ?? null;
      const publisherName = issue.publisher || comic.publisher?.name;
      if (!publisherId && publisherName) {
        const { data: pub } = await supabase
          .from("publishers")
          .upsert({ user_id: user.id, name: publisherName }, { onConflict: "user_id,name" })
          .select("id")
          .single();
        publisherId = pub?.id;
      }

      let seriesId = comic.series?.id ?? null;
      const seriesName = issue.series_name || comic.series?.name || issue.title;
      if (!seriesId && seriesName) {
        const { data: ser } = await supabase
          .from("series")
          .upsert({
            user_id:      user.id,
            publisher_id: publisherId,
            name:         seriesName,
            cover_url:    issue.cover_url,
          }, { onConflict: "user_id,name" })
          .select("id")
          .single();
        seriesId = ser?.id;
      }

      let existingQuery = supabase
        .from("comics")
        .select("id")
        .eq("user_id", user.id);

      existingQuery = seriesId
        ? existingQuery.eq("series_id", seriesId)
        : existingQuery.eq("title", issue.title || seriesName || "Untitled");

      existingQuery = issue.issue_number
        ? existingQuery.eq("issue_number", issue.issue_number)
        : existingQuery.is("issue_number", null);

      const { data: existing } = await existingQuery.maybeSingle();
      let libraryId = existing?.id;

      if (!existing) {
        const { data: inserted, error } = await supabase
          .from("comics")
          .insert({
            user_id:      user.id,
            series_id:    seriesId,
            publisher_id: publisherId,
            title:        issue.title || seriesName || "Untitled",
            issue_number: issue.issue_number ?? null,
            comicvine_id: issue.comicvine_id ?? issue.metron_id ?? null,
            cover_url:    issue.cover_url,
            description:  issue.description,
            release_date: issue.release_date,
            writers:      issue.writers,
            artists:      issue.artists,
            characters:   issue.characters,
          })
          .select("id")
          .single();
        if (error) throw error;
        libraryId = inserted?.id;
      }

      setPriorIssues((items) => items.map((item) =>
        priorIssueKey(item) === key ? { ...item, is_owned: true, library_id: libraryId } : item
      ));
    } catch (e) {
      alert("Could not add issue to library: " + e.message);
    } finally {
      setAddingPrior(null);
    }
  }

  return (
    <div style={s.page}>
      <Link href="/library" style={s.back}>← Library</Link>

      <div style={s.hero}>
        <div style={s.coverWrap}>
          {comic.cover_url
            ? <img src={comic.cover_url} alt={comic.title} style={s.cover} />
            : <div style={{ ...s.cover, ...s.coverPlaceholder }}>No cover</div>
          }
          {comic.has_pdf && <span style={s.pdfBadge}>PDF</span>}
          <InkButton variant="ghost" size="sm" onClick={openCoverPicker} style={s.changeCoverBtn}>Change Cover</InkButton>
        </div>

        <div style={s.meta}>
          {comic.series && <Link href={`/library?series=${comic.series.id}`} style={s.seriesLink}>{comic.series.name}</Link>}
          <h1 style={s.title}>{comic.title}{comic.issue_number ? ` #${comic.issue_number}` : ""}</h1>
          {comic.publisher && <p style={s.publisher}>{comic.publisher.name}</p>}
          {comic.release_date && <p style={s.date}>{comic.release_date.slice(0, 7)}</p>}

          <div style={s.stats}>
            <div style={s.stat}>
              <span style={s.statVal}>{readCount}</span>
              <span style={s.statLabel}>Times Read</span>
            </div>
            <div style={s.stat}>
              <span style={s.statVal}>{lastRead ? new Date(lastRead).toLocaleDateString() : "—"}</span>
              <span style={s.statLabel}>Last Read</span>
            </div>
          </div>

          <div style={s.actions}>
            <InkButton onClick={() => setLogOpen(!logOpen)}>Log Reading</InkButton>
            <InkButton variant="ghost" onClick={() => setSchedOpen(!schedOpen)}>+ Schedule</InkButton>
            {(comic.has_pdf || comic.drive_file_id) && (
              <InkButton href={`/comic/${comic.id}/read`} variant="gold">Read PDF</InkButton>
            )}
            <label className={`ink-btn ink-btn--md ink-btn--ghost ${uploadingPdf || driveStatus === "uploading" ? "is-disabled" : ""}`} style={uploadingPdf || driveStatus === "uploading" ? s.disabledLabel : undefined}>
              {uploadingPdf ? "Saving…" : comic.has_pdf ? "Replace (device)" : "Add from device"}
              <input
                type="file"
                accept="application/pdf"
                disabled={uploadingPdf || driveStatus === "uploading"}
                onChange={(e) => attachPdf(e.target.files?.[0])}
                style={{ display: "none" }}
              />
            </label>
            <InkButton variant="ghost" onClick={openDrivePicker} disabled={uploadingPdf || driveStatus === "uploading"}>
              Link from Drive
            </InkButton>
            <InkButton href={`/scan?replace=${comic.id}`} variant="ghost">Re-identify</InkButton>
          </div>
          {pdfError && <p style={s.pdfError}>{pdfError}</p>}
          {driveStatus === "uploading" && <p style={s.driveHint}>Syncing to Google Drive…</p>}
          {driveStatus === "synced"    && <p style={s.driveHint}>Synced to Drive — readable on any device</p>}
          {driveStatus === "no_drive"  && <p style={s.driveHint}>Saved locally. Connect Google Drive in Settings to read on other devices.</p>}

          {logOpen && (
            <div style={s.inlineForm}>
              <p style={s.formLabel}>Notes (optional)</p>
              <textarea className="ink-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="How was it?" style={{ marginBottom: 10 }} />
              <InkButton onClick={logReading} disabled={saving}>
                {saving ? "Saving…" : "Mark as Read"}
              </InkButton>
            </div>
          )}

          {schedOpen && (
            <div style={s.inlineForm}>
              <p style={s.formLabel}>Date</p>
              <input className="ink-input" type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} style={{ marginBottom: 10 }} />
              <InkButton onClick={addToSchedule} disabled={saving || !schedDate}>
                {saving ? "Saving…" : "Add to Schedule"}
              </InkButton>
            </div>
          )}
        </div>
      </div>

      {coverPickerOpen && (
        <div style={s.pickerPanel}>
          <div style={s.pickerHeader}>
            <h2 style={s.pickerTitle}>Choose a Cover</h2>
            <button style={s.pickerClose} onClick={() => setCoverPickerOpen(false)}>✕</button>
          </div>

          {fetchingCovers && <p style={s.pickerHint}>Searching for covers…</p>}

          {!fetchingCovers && altCovers.length > 0 && (
            <div style={s.coverGrid}>
              {altCovers.map((c, i) => (
                <button key={i} style={s.coverGridItem} onClick={() => saveCover(c.url)} disabled={savingCover} title={c.label}>
              <img src={c.url} alt={c.label} style={s.coverGridImg} loading="lazy" />
                </button>
              ))}
            </div>
          )}

          {!fetchingCovers && altCovers.length === 0 && (
            <p style={s.pickerHint}>No alternative covers found — paste a URL below.</p>
          )}

          <div style={s.customUrlRow}>
            <input
              className="ink-input"
              value={customCoverUrl}
              onChange={e => setCustomCoverUrl(e.target.value)}
              placeholder="Or paste an image URL…"
              style={s.customUrlInput}
            />
            <InkButton
              onClick={() => saveCover(customCoverUrl)}
              disabled={savingCover || !customCoverUrl.trim()}
            >
              {savingCover ? "Saving…" : "Use"}
            </InkButton>
          </div>
        </div>
      )}

      {drivePickerOpen && (
        <div style={s.pickerPanel}>
          <div style={s.pickerHeader}>
            <h2 style={s.pickerTitle}>Link from Google Drive</h2>
            <button style={s.pickerClose} onClick={() => setDrivePickerOpen(false)}>✕</button>
          </div>

          {loadingDriveFiles && <p style={s.pickerHint}>Loading Drive files…</p>}
          {!loadingDriveFiles && driveFilesError && <p style={{ ...s.pickerHint, color: "var(--accent)" }}>{driveFilesError}</p>}
          {!loadingDriveFiles && !driveFilesError && driveFiles.length === 0 && (
            <p style={s.pickerHint}>No PDFs found in your One Shot Drive folder.</p>
          )}
          {!loadingDriveFiles && driveFiles.length > 0 && (
            <div style={s.driveFileList}>
              {driveFiles.map((f) => (
                <div key={f.id} style={s.driveFileRow}>
                  <div style={s.driveFileMeta}>
                    <p style={s.driveFileName}>{f.name}</p>
                    <p style={s.driveFileSub}>
                      {f.size ? `${(f.size / 1_048_576).toFixed(1)} MB · ` : ""}
                      {f.imported ? "Already linked" : "Not linked"}
                    </p>
                  </div>
                  <InkButton
                    size="sm"
                    variant={f.id === comic.drive_file_id ? "gold" : "ghost"}
                    disabled={linkingDriveFile === f.id}
                    onClick={() => linkDriveFile(f)}
                  >
                    {linkingDriveFile === f.id ? "Linking…" : f.id === comic.drive_file_id ? "Linked" : "Link"}
                  </InkButton>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {comic.description && (
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Description</h2>
          <p style={s.description}>{comic.description}</p>
        </div>
      )}

      {(comic.writers?.length || comic.artists?.length || comic.characters?.length) && (
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Credits</h2>
          {comic.writers?.length > 0 && <p style={s.credit}><span style={s.creditKey}>Writers</span>{comic.writers.join(", ")}</p>}
          {comic.artists?.length > 0 && <p style={s.credit}><span style={s.creditKey}>Artists</span>{comic.artists.join(", ")}</p>}
          {comic.characters?.length > 0 && <p style={s.credit}><span style={s.creditKey}>Characters</span>{comic.characters.slice(0, 10).join(", ")}</p>}
        </div>
      )}

      <div style={s.section}>
        <div style={s.sectionHeaderRow}>
          <h2 style={s.sectionTitle}>Also In This Series</h2>
          {priorIssues.length > 0 && <span style={s.sectionCount}>{priorIssues.length} found</span>}
        </div>

        {loadingPrior && <p style={s.priorHint}>Loading series issues...</p>}
        {!loadingPrior && priorError && <p style={{ ...s.priorHint, color: "var(--accent)" }}>{priorError}</p>}
        {!loadingPrior && !priorError && priorIssues.length === 0 && (
          <p style={s.priorHint}>No other issues found for this series yet.</p>
        )}
        {!loadingPrior && !priorError && priorIssues.length > 0 && (
          <div style={s.priorList}>
            {priorIssues.map((issue) => (
              <div key={priorIssueKey(issue)} style={s.priorRow}>
                {issue.cover_url
                  ? <img src={issue.cover_url} alt={issue.title} style={s.priorCover} loading="lazy" />
                  : <div style={{ ...s.priorCover, ...s.priorCoverBlank }} />
                }
                <div style={s.priorMeta}>
                  <p style={s.priorTitle}>{issue.series_name || comic.series?.name} {issue.issue_number ? `#${issue.issue_number}` : ""}</p>
                  <p style={s.priorSub}>{[issue.publisher, formatDate(issue.release_date), issue.source].filter(Boolean).join(" · ")}</p>
                </div>
                {issue.is_owned ? (
                  <InkButton href={`/comic/${issue.library_id}`} variant="ghost" size="sm">In Library</InkButton>
                ) : (
                  <InkButton onClick={() => addPriorIssue(issue)} disabled={addingPrior === priorIssueKey(issue)} size="sm">
                    {addingPrior === priorIssueKey(issue) ? "Adding..." : "Bought"}
                  </InkButton>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {readLog.length > 0 && (
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Reading History</h2>
          {readLog.map((entry) => (
            <div key={entry.id} style={s.logEntry}>
              <span style={s.logDate}>{new Date(entry.read_at).toLocaleDateString()}</span>
              {entry.notes && <span style={s.logNotes}>{entry.notes}</span>}
            </div>
          ))}
        </div>
      )}

      <InkButton variant="ghost" size="sm" onClick={handleDelete}>Remove from Library</InkButton>
    </div>
  );
}

function priorIssueKey(issue) {
  return `${issue.source ?? ""}|${issue.comicvine_id ?? issue.metron_id ?? ""}|${issue.series_name ?? ""}|${issue.issue_number ?? ""}`;
}

function formatDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

const s = {
  page:          { maxWidth: "var(--content-max-md)" },
  back:          { color: "var(--text-faint)", fontSize: 13, display: "inline-block", marginBottom: 22 },
  hero:          { display: "flex", gap: 28, marginBottom: 32, flexWrap: "wrap" },
  coverWrap:     { flexShrink: 0, width: "clamp(180px, 22vw, 260px)", position: "relative" },
  cover:         { width: "100%", aspectRatio: "2/3", objectFit: "cover", borderRadius: 12, display: "block", border: "2px solid var(--ink-000)", boxShadow: "4px 4px 0 var(--ink-000)" },
  coverPlaceholder: { background: "var(--bg-card)", color: "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, borderRadius: 12 },
  meta:          { flex: 1, minWidth: 240 },
  seriesLink:    { color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6, fontWeight: 600 },
  title:         { fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4, lineHeight: 1.2 },
  publisher:     { color: "var(--text-soft)", fontSize: 14, marginBottom: 4 },
  date:          { color: "var(--text-faint)", fontSize: 13, marginBottom: 20 },
  stats:         { display: "flex", gap: 12, marginBottom: 20 },
  stat:          { background: "var(--bg-card)", backgroundImage: "var(--halftone-dots)", backgroundSize: "var(--halftone-size)", borderRadius: 10, padding: "12px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 120, border: "2px solid var(--ink-000)", boxShadow: "3px 3px 0 var(--ink-000)" },
  statVal:       { color: "var(--text)", fontFamily: "var(--font-burst)", fontSize: 28 },
  statLabel:     { color: "var(--text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, fontFamily: "var(--font-display)" },
  actions:       { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 },
  pdfMissing:    { display: "inline-flex", alignItems: "center", minHeight: 38, color: "var(--hero-gold)", fontSize: 12, fontWeight: 700 },
  pdfError:      { color: "var(--accent)", fontSize: 12, fontWeight: 700, marginTop: -6, marginBottom: 12 },
  driveHint:     { color: "var(--text-faint)", fontSize: 12, marginTop: -6, marginBottom: 12 },
  pdfBadge:      { position: "absolute", right: 8, bottom: 48, background: "var(--hero-gold)", color: "#000", fontSize: 10, fontWeight: 800, padding: "3px 6px", borderRadius: 6, border: "2px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)", letterSpacing: 0.5 },
  disabledLabel: { opacity: 0.5, pointerEvents: "none" },
  inlineForm:    { background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: "3px 3px 0 var(--ink-000)" },
  formLabel:     { color: "var(--text-soft)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 600 },
  section:       { marginBottom: 28 },
  sectionHeaderRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  sectionTitle:  { color: "var(--text)", fontSize: 20, fontWeight: 700, marginBottom: 10, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.04em" },
  sectionCount:  { color: "var(--text-faint)", fontSize: 12, fontFamily: "var(--font-mono)" },
  description:   { color: "var(--text-soft)", fontSize: 14, lineHeight: 1.7 },
  credit:        { color: "var(--text-soft)", fontSize: 14, marginBottom: 6, display: "flex", gap: 12 },
  creditKey:     { color: "var(--text-faint)", width: 84, flexShrink: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", paddingTop: 2 },
  logEntry:      { display: "flex", gap: 16, padding: "8px 0", borderBottom: "1px solid var(--border)" },
  logDate:       { color: "var(--text-soft)", fontSize: 13, flexShrink: 0 },
  logNotes:      { color: "var(--text-faint)", fontSize: 13 },
  changeCoverBtn: { width: "100%", marginTop: 10 },

  priorHint:     { color: "var(--text-faint)", fontSize: 13, padding: "12px 0" },
  priorList:     { display: "flex", flexDirection: "column", gap: 10 },
  priorRow:      { display: "flex", alignItems: "center", gap: 12, background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 12, padding: 10, boxShadow: "2px 2px 0 var(--ink-000)" },
  priorCover:    { width: "clamp(48px, 6vw, 76px)", aspectRatio: "2/3", objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--bg-surface)" },
  priorCoverBlank: { border: "1px solid var(--border)" },
  priorMeta:     { flex: 1, minWidth: 0 },
  priorTitle:    { color: "var(--text)", fontSize: 14, fontWeight: 700 },
  priorSub:      { color: "var(--text-faint)", fontSize: 12, marginTop: 3 },

  pickerPanel:   { background: "var(--bg-surface)", border: "2px solid var(--ink-000)", borderRadius: 14, padding: 20, marginBottom: 28, boxShadow: "3px 3px 0 var(--ink-000)" },
  pickerHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  pickerTitle:   { fontSize: 20, fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "0.04em", textTransform: "uppercase" },
  pickerClose:   { background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer", padding: "0 4px" },
  pickerHint:    { color: "var(--text-faint)", fontSize: 13, marginBottom: 16 },

  coverGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10, marginBottom: 16 },
  coverGridItem: { background: "none", border: "2px solid transparent", borderRadius: 8, padding: 0, cursor: "pointer", overflow: "hidden", transition: "border-color 120ms" },
  coverGridImg:  { width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block", borderRadius: 6 },

  customUrlRow:  { display: "flex", gap: 8, marginTop: 8 },
  customUrlInput:{ flex: 1 },

  driveFileList: { display: "flex", flexDirection: "column", gap: 8 },
  driveFileRow:  { display: "flex", alignItems: "center", gap: 12, background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 10, padding: "10px 12px", boxShadow: "2px 2px 0 var(--ink-000)" },
  driveFileMeta: { flex: 1, minWidth: 0 },
  driveFileName: { color: "var(--text)", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  driveFileSub:  { color: "var(--text-faint)", fontSize: 11, marginTop: 2 },
};
