"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase-browser";
import { readLocalLibrary, writeLocalLibrary, localConnectionState } from "../lib/local-data-store";

export function useComics() {
  const [comics, setComics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionState, setConnectionState] = useState("unknown");
  const [lastSynced, setLastSynced] = useState(null);

  const fetchComics = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setConnectionState(localConnectionState());

    // 1. Load from cache first for immediate UI
    const cached = readLocalLibrary();
    if (cached.comics.length && !forceRefresh) {
      setComics(cached.comics);
      setLastSynced(cached.savedAt);
    }

    // 2. Background sync with Supabase
    try {
      const { data, error: sbError } = await supabase
        .from("comics")
        .select(`
          id, title, issue_number, cover_url, has_pdf, drive_file_id,
          release_date, created_at,
          series:series_id(id, name, publisher:publisher_id(id, name)),
          publisher:publisher_id(id, name),
          reading_log(id)
        `)
        .order("created_at", { ascending: false });

      if (sbError) throw sbError;

      const enrichedData = (data ?? []).map((c) => ({
        ...c,
        read_count: c.reading_log?.length ?? 0,
      }));

      setComics(enrichedData);
      writeLocalLibrary(enrichedData);
      setLastSynced(new Date().toISOString());
      setError(null);
    } catch (e) {
      console.error("Supabase sync failed:", e);
      setError(e.message);
      // If we failed but have cached data, we don't clear the UI
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComics();
  }, [fetchComics]);

  return {
    comics,
    loading,
    error,
    connectionState,
    lastSynced,
    refresh: () => fetchComics(true),
  };
}
