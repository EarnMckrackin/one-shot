const fs = require("fs");
const path = require("path");

// Keep the PDF.js worker and WASM files in public/ so Android WebView can load them.
const workerSrc = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs");
const workerDest = path.join(__dirname, "..", "public", "pdf.worker.min.mjs");
if (fs.existsSync(workerSrc)) {
  fs.copyFileSync(workerSrc, workerDest);
}

const wasmSrcDir = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "wasm");
const wasmDestDir = path.join(__dirname, "..", "public", "wasm");
if (fs.existsSync(wasmSrcDir)) {
  fs.mkdirSync(wasmDestDir, { recursive: true });
  for (const file of fs.readdirSync(wasmSrcDir)) {
    fs.copyFileSync(path.join(wasmSrcDir, file), path.join(wasmDestDir, file));
  }
}

const buildGradle = path.join(
  __dirname,
  "..",
  "node_modules",
  "@pantrist",
  "capacitor-plugin-ml-kit-text-recognition",
  "android",
  "build.gradle"
);

if (!fs.existsSync(buildGradle)) {
  process.exit(0);
}

const source = fs.readFileSync(buildGradle, "utf8");
const patched = source
  .replace(/\n\s*jcenter\(\)/g, "\n        mavenCentral()")
  .replace(/proguard-android\.txt/g, "proguard-android-optimize.txt");

if (patched !== source) {
  fs.writeFileSync(buildGradle, patched);
  console.log("Patched ML Kit text recognition Gradle repositories.");
}
