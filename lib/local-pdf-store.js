"use client";

import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

const DB_NAME = "oneshot-local-pdfs";
const DB_VERSION = 1;
const STORE_NAME = "pdfs";
const PDF_DIR = "pdfs";

export async function saveLocalPdf(comicId, file) {
  const native = await writeNativePdf(comicId, file).catch(() => null);
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
        nativePath: native?.path ?? null,
        nativeUri: native?.uri ?? null,
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

export async function ensureNativePdf(comicId) {
  const record = await getLocalPdf(comicId);
  if (!record?.blob) return null;

  if (Capacitor.getPlatform() === "web") {
    return { uri: URL.createObjectURL(record.blob), name: record.name };
  }

  if (record.nativeUri && record.nativePath) {
    return { uri: record.nativeUri, path: record.nativePath, name: record.name };
  }

  const native = await writeNativePdf(comicId, record.blob);
  const next = {
    ...record,
    nativePath: native.path,
    nativeUri: native.uri,
    updatedAt: new Date().toISOString(),
  };
  const db = await openDb();
  await requestToPromise(
    db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(next)
  );
  return { ...native, name: record.name };
}

async function writeNativePdf(comicId, file) {
  if (Capacitor.getPlatform() === "web") return null;

  const path = `${PDF_DIR}/${sanitizePathPart(comicId)}.pdf`;
  await Filesystem.mkdir({
    path: PDF_DIR,
    directory: Directory.Data,
    recursive: true,
  }).catch(() => {});

  await Filesystem.writeFile({
    path,
    data: await blobToBase64(file),
    directory: Directory.Data,
    recursive: true,
  });

  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Data,
  });

  return { path, uri };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.split(",").pop() : value);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function sanitizePathPart(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
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
