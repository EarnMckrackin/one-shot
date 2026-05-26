"use client";
import { useState } from "react";
import { supabase } from "../../../lib/supabase-browser";
import { useRouter } from "next/navigation";
import InkButton from "../../../components/InkButton";
import { saveLocalPdfBlob } from "../../../lib/local-pdf-store";

export default function SettingsClient({ user, googleConnected, driveFolderId: initialFolderId, minutesPerDay: initialMinutes, flashMessage }) {
  const router = useRouter();
  const [minutes, setMinutes]       = useState(initialMinutes);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [folderUrl, setFolderUrl]   = useState(initialFolderId ? `https://drive.google.com/drive/folders/${initialFolderId}` : "");
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderSaved, setFolderSaved]   = useState(false);
  const [folderError, setFolderError]   = useState("");
  const [driveFiles, setDriveFiles]     = useState(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [importingId, setImportingId]   = useState(null);
  const [importError, setImportError]   = useState("");

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function parseFolderId(url) {
    const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : url.trim();
  }

  async function saveDriveFolder() {
    setFolderError("");
    const folderId = parseFolderId(folderUrl);
    if (!folderId) { setFolderError("Paste a Google Drive folder URL or ID."); return; }
    setFolderSaving(true);
    try {
      const res = await fetch("/api/google/folder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "Failed to save."); }
      setFolderSaved(true);
      setTimeout(() => setFolderSaved(false), 2000);
    } catch (e) {
      setFolderError(e.message);
    } finally {
      setFolderSaving(false);
    }
  }

  async function loadDriveFiles() {
    setLoadingFiles(true);
    setImportError("");
    try {
      const res = await fetch("/api/google/drive-files");
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "no_folder") setImportError("Save a folder URL above first.");
        else if (json.code === "reauth") setImportError(json.error || "Drive access denied — reconnect Google Drive.");
        else setImportError(json.error || "Could not load Drive files.");
        return;
      }
      setDriveFiles(json.files);
    } catch {
      setImportError("Could not reach Google Drive.");
    } finally {
      setLoadingFiles(false);
    }
  }

  async function importFile(file) {
    setImportingId(file.id);
    setImportError("");
    try {
      const impRes = await fetch("/api/google/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: file.id, filename: file.name }),
      });
      if (!impRes.ok) { const j = await impRes.json(); throw new Error(j.error || "Import failed."); }
      const { comicId } = await impRes.json();

      const dlRes = await fetch(`/api/google/drive-files/${file.id}`);
      if (!dlRes.ok) throw new Error("Download failed.");
      const blob = await dlRes.blob();
      await saveLocalPdfBlob(comicId, blob, file.name);

      setDriveFiles(prev => prev.map(f =>
        f.id === file.id ? { ...f, imported: true, comicId } : f
      ));
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImportingId(null);
    }
  }

  async function saveReading() {
    setSaving(true);
    await supabase.from("user_preferences").upsert(
      { user_id: user.id, minutes_per_day: minutes, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const issuesPerDay = Math.max(1, Math.floor(minutes / 15));

  return (
    <div style={s.page}>
      <h1 style={s.title}>Settings</h1>

      {flashMessage && (
        <div style={{ ...s.flash, ...(flashMessage.includes("!") ? s.flashSuccess : s.flashWarn) }}>
          {flashMessage}
        </div>
      )}

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Reading</h2>
        <p style={s.detail}>Set your daily reading budget. The local scheduler uses this to plan your week.</p>
        <div style={s.sliderRow}>
          <input
            type="range"
            min={15} max={180} step={15}
            value={minutes}
            onChange={e => setMinutes(Number(e.target.value))}
            style={s.slider}
          />
          <span style={s.sliderVal}>{minutes} min/day</span>
        </div>
        <p style={s.hint}>~{issuesPerDay} issue{issuesPerDay !== 1 ? "s" : ""} per day at 15 min each</p>
        <InkButton onClick={saveReading} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </InkButton>
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Account</h2>
        <p style={s.detail}>{user.email}</p>
        <InkButton variant="ghost" onClick={signOut}>Sign Out</InkButton>
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Google Drive</h2>
        <p style={s.detail}>
          {googleConnected
            ? "Connected — PDFs are stored in your Google Drive under the One Shot folder."
            : "Connect Google Drive to store and access your comic PDFs from your own account."}
        </p>
        {googleConnected ? (
          <>
            <span style={s.connected}>● Connected</span>
            <p style={{ ...s.detail, marginTop: 16 }}>
              Paste a Google Drive folder URL to upload PDFs there instead of the default "One Shot" folder.
            </p>
            <div style={s.folderRow}>
              <input
                className="ink-input"
                placeholder="https://drive.google.com/drive/folders/…"
                value={folderUrl}
                onChange={e => { setFolderUrl(e.target.value); setFolderError(""); setFolderSaved(false); }}
                style={s.folderInput}
              />
              <InkButton onClick={saveDriveFolder} disabled={folderSaving} size="sm">
                {folderSaving ? "Saving…" : folderSaved ? "Saved ✓" : "Save"}
              </InkButton>
            </div>
            {folderError && <p style={s.folderErr}>{folderError}</p>}

            <div style={s.importHeader}>
              <span style={s.importLabel}>Import from Drive</span>
              <InkButton onClick={loadDriveFiles} disabled={loadingFiles} size="sm" variant="ghost">
                {loadingFiles ? "Loading…" : driveFiles ? "Refresh" : "Load files"}
              </InkButton>
            </div>
            {importError && <p style={s.folderErr}>{importError}</p>}
            {driveFiles && driveFiles.length === 0 && (
              <p style={s.hint}>No PDFs found in this folder. If you just connected, try reconnecting Google Drive to grant read access.</p>
            )}
            {driveFiles && driveFiles.length > 0 && (
              <div style={s.fileList}>
                {driveFiles.map(file => (
                  <div key={file.id} style={s.fileRow}>
                    <div style={s.fileName}>
                      <span>{file.name}</span>
                      {file.size && <span style={s.fileSize}>{(file.size / 1_048_576).toFixed(1)} MB</span>}
                    </div>
                    {file.imported ? (
                      <div style={s.fileActions}>
                        <span style={s.importedBadge}>In Library</span>
                        <InkButton
                          size="sm" variant="ghost"
                          disabled={importingId === file.id}
                          onClick={() => importFile(file)}
                        >
                          {importingId === file.id ? "Downloading…" : "Re-download"}
                        </InkButton>
                      </div>
                    ) : (
                      <InkButton
                        size="sm"
                        disabled={importingId === file.id}
                        onClick={() => importFile(file)}
                      >
                        {importingId === file.id ? "Importing…" : "Import"}
                      </InkButton>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p style={s.hint}>
              To import PDFs on a new device, reconnect Google Drive then load files here.{" "}
              <a href="/api/google/auth" style={s.reconnectLink}>Reconnect</a>
            </p>
          </>
        ) : (
          <InkButton href="/api/google/auth">Connect Google Drive</InkButton>
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>About</h2>
        <p style={s.detail}>One Shot — your comic collection, pull list, and reading schedule.</p>
        <p style={s.detail}>Metadata from ComicVine and Metron · New releases from League of Comic Geeks and provider fallbacks</p>
      </section>
    </div>
  );
}

const s = {
  page:         { maxWidth: "var(--content-max-sm)" },
  title:        { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 28 },
  flash:        { borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 14, fontWeight: 600 },
  flashSuccess: { background: "rgba(6,214,160,0.12)", color: "var(--hero-cyan)", border: "1px solid var(--hero-cyan)" },
  flashWarn:    { background: "rgba(239,43,61,0.1)", color: "var(--accent)", border: "1px solid var(--accent)" },
  section:      { background: "var(--bg-surface)", border: "2px solid var(--ink-000)", borderRadius: 14, padding: 24, marginBottom: 16, boxShadow: "4px 4px 0 var(--ink-000)" },
  sectionTitle: { fontSize: 22, fontWeight: 700, marginBottom: 10, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.04em", paddingBottom: 8, borderBottom: "2px solid var(--ink-000)" },
  detail:       { color: "var(--text-soft)", fontSize: 14, marginBottom: 12, lineHeight: 1.6 },
  sliderRow:    { display: "flex", alignItems: "center", gap: 16, marginBottom: 8 },
  slider:       { flex: 1, accentColor: "var(--accent)", cursor: "pointer" },
  sliderVal:    { fontFamily: "var(--font-burst)", fontSize: 22, color: "var(--hero-gold)", minWidth: 110, textAlign: "right", letterSpacing: "0.04em" },
  hint:         { color: "var(--text-faint)", fontSize: 12, marginBottom: 16 },
  connected:    { color: "var(--hero-cyan)", fontWeight: 600, fontSize: 14 },
  folderRow:      { display: "flex", gap: 8, alignItems: "center", marginTop: 8, marginBottom: 4 },
  folderInput:    { flex: 1 },
  folderErr:      { color: "var(--accent)", fontSize: 12, marginTop: 4 },
  importHeader:   { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 8, borderTop: "1px solid var(--ink-000)", paddingTop: 16 },
  importLabel:    { fontSize: 14, fontWeight: 600, color: "var(--text-soft)" },
  fileList:       { display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 },
  fileRow:        { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", background: "var(--bg-base)", borderRadius: 8, border: "1px solid var(--ink-000)" },
  fileName:       { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 },
  fileSize:       { fontSize: 11, color: "var(--text-faint)" },
  fileActions:    { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  importedBadge:  { fontSize: 11, fontWeight: 600, color: "var(--hero-cyan)", whiteSpace: "nowrap" },
  reconnectLink:  { color: "var(--accent)", textDecoration: "underline", cursor: "pointer" },
};
