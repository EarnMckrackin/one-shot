import "./globals.css";
import PWARegistration from "../components/PWARegistration";

export const metadata = {
  title:       "One Shot",
  description: "Your complete comic collection, pull list, and reading schedule",
  manifest:    "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "One Shot" },
};

export const viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body>
        <PWARegistration />
        {children}
      </body>
    </html>
  );
}
