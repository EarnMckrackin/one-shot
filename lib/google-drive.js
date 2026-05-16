import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const FOLDER_NAME = "One Shot";

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt:      "consent",
    scope:       SCOPES,
  });
}

export async function getTokensFromCode(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export function getDriveClient(tokens) {
  const auth = getOAuthClient();
  auth.setCredentials(tokens);
  return google.drive({ version: "v3", auth });
}

export async function getOrCreateFolder(drive) {
  const res = await drive.files.list({
    q:      `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
  });

  if (res.data.files.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name:     FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  return folder.data.id;
}

export async function uploadPDFToDrive(drive, pdfBuffer, filename) {
  const folderId = await getOrCreateFolder(drive);

  const { Readable } = require("stream");
  const stream = Readable.from(pdfBuffer);

  const res = await drive.files.create({
    requestBody: {
      name:    filename,
      parents: [folderId],
    },
    media: {
      mimeType: "application/pdf",
      body:     stream,
    },
    fields: "id, webViewLink, webContentLink",
  });

  return {
    drive_file_id:    res.data.id,
    drive_view_url:   res.data.webViewLink,
    drive_export_url: res.data.webContentLink,
  };
}

export async function getDriveFileUrl(drive, fileId) {
  const res = await drive.files.get({
    fileId,
    fields: "webViewLink",
  });
  return res.data.webViewLink;
}

// Encrypt/decrypt tokens for storage
import crypto from "crypto";

const ALG = "aes-256-gcm";

export function encryptTokens(tokens) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY.padEnd(32).slice(0, 32));
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptTokens(encrypted) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY.padEnd(32).slice(0, 32));
  const [ivHex, tagHex, dataHex] = encrypted.split(":");
  const iv      = Buffer.from(ivHex, "hex");
  const tag     = Buffer.from(tagHex, "hex");
  const data    = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALG, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}
