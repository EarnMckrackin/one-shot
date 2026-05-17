# Native Packaging

This repository can be wrapped as native iPhone/iPad and Android tablet apps with Capacitor.

Important constraint: this app is a Next.js full-stack app with server routes, Supabase auth, and AI/API calls. The native wrappers are shells around a running web app URL. They do not run the backend locally on the device.

## Choose a Runtime URL

Use one of these:

1. Deployed app
`ONE_SHOT_APP_URL=https://your-deployment.vercel.app`

2. Local desktop dev server over LAN
`ONE_SHOT_APP_URL=http://YOUR-DESKTOP-LAN-IP:3000`

For LAN testing, your desktop must be running `npm run dev` and the phone/tablet must be on the same network.

## Build the Native Shells

Sync the configured URL into the native projects:

```bash
ONE_SHOT_APP_URL=https://your-deployment.vercel.app npm run mobile:sync
```

Open the iOS project:

```bash
npm run mobile:ios
```

Open the Android project:

```bash
npm run mobile:android
```

## Local Device Testing

1. Start the desktop app with `npm run dev`
2. Find your desktop LAN IP, for example `192.168.1.51`
3. Sync with:

```bash
ONE_SHOT_APP_URL=http://192.168.1.51:3000 npm run mobile:sync
```

4. Rebuild/run from Xcode or Android Studio

## Notes

- If your desktop IP changes, rerun `mobile:sync` with the new IP.
- For real daily use, point the wrappers at a deployed HTTPS URL instead of a LAN URL.
- App Store / Play Store submission will require signing, bundle identifiers, and platform-specific icon/splash work in Xcode and Android Studio.
