"use client";
import { useState, useCallback } from "react";

export function useAsync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (promise) => {
    setLoading(true);
    setError(null);
    try {
      const result = await promise;
      return [result, null];
    } catch (err) {
      console.error("Async error:", err);
      const message = err.message || "An unexpected error occurred";
      setError(message);
      return [null, message];
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, run, setError, setLoading };
}
