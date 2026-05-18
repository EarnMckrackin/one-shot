"use client";

const DB_NAME = "oneshot-local-pdfs";
const DB_VERSION = 1;
const STORE_NAME = "pdfs";

export async function saveLocalPdf(comicId, file) {
  const db = await openDb();
  await requestToPromise(
    db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put({
        comicId,
        blob: file,
        name: file.name,
        type: file.type || "application/pdf",
        size: file.size,
        updatedAt: new Date().toISOString(),
      })
  );
}

export async function getLocalPdf(comicId) {
  const db = await openDb();
  return requestToPromise(
    db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(comicId)
  );
}

export async function getLocalPdfUrl(comicId) {
  const record = await getLocalPdf(comicId);
  if (!record?.blob) return null;
  return {
    url: URL.createObjectURL(record.blob),
    name: record.name,
  };
}

function openDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Local PDF storage is not available on this device."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "comicId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
