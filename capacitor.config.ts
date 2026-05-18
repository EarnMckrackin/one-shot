import type { CapacitorConfig } from "@capacitor/cli";

const appUrl = process.env.ONE_SHOT_APP_URL?.trim() ||
  "https://one-shot-git-main-jvincentc-4157s-projects.vercel.app";

const config: CapacitorConfig = {
  appId: "com.earnmckrackin.oneshot",
  appName: "One Shot",
  webDir: "mobile-shell",
  bundledWebRuntime: false,
  server: appUrl
    ? {
        url: appUrl,
        cleartext: appUrl.startsWith("http://"),
        androidScheme: appUrl.startsWith("http://") ? "http" : "https",
      }
    : undefined,
};

export default config;
