import type { CapacitorConfig } from "@capacitor/cli";

const appUrl = process.env.ONE_SHOT_APP_URL?.trim();

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
