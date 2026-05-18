const fs = require("fs");
const path = require("path");

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
