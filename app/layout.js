import "./globals.css";

export const metadata = {
  title:       "One Shot",
  description: "Your complete comic collection, pull list, and reading schedule",
  manifest:    "/manifest.json",
  themeColor:  "#0a0a0f",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "One Shot" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
