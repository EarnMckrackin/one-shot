# One Shot — To Do

## 1. Environment Setup (required before the app runs)

Fill in `.env.local` with real values:

- [ ] `COMICVINE_API_KEY` — paste your key into `.env.local`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase dashboard → Project Settings → API → anon/public key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — same page → service_role key (keep secret)
- [ ] `ANTHROPIC_API_KEY` — console.anthropic.com
- [ ] `METRON_USERNAME` + `METRON_PASSWORD` — register free at metron.cloud (no API token needed, just your login credentials)
- [ ] `ENCRYPTION_KEY` — any 32-char random string (used to encrypt Google OAuth tokens at rest)
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — see Google Drive section below

## 2. Google Drive OAuth Setup

- [ ] Go to console.cloud.google.com → create a project
- [ ] Enable the **Google Drive API**
- [ ] OAuth consent screen → External → add your email as a test user
- [ ] Credentials → Create OAuth 2.0 Client ID → Web application
  - Authorized redirect URI: `http://localhost:3000/api/google/callback` (dev) + your prod URL
- [ ] Copy Client ID + Secret into `.env.local`

## 3. Supabase Database

- [ ] Run the migration files against your Supabase project:
  - `supabase/migrations/001_initial.sql` — all tables and RLS policies
  - Apply the story arcs migration (already applied to the remote project during setup)
- [ ] Confirm Row Level Security is enabled on all tables in the Supabase dashboard

## 4. Mobile Nav — UX Fix Needed

The bottom nav bar now has 9 links which is too many for mobile. Options:
- [ ] Split into two rows or add a "More" overflow menu
- [ ] Or hide the 4 new routes in a collapsible "Discover" section on mobile

## 5. Missing Pages

- [ ] `app/(app)/gaps/page.js` — create the page wrapper (same pattern as arcs/page.js)
- [ ] Verify all 4 new routes have both a `page.js` and `*Client.jsx` file

## 6. Continuity Compass — Polish

- [ ] Add a blinking cursor CSS animation (the `▌` cursor in CompassClient needs a `@keyframes blink` rule in globals.css or inline)
- [ ] Handle case where user has zero comics logged — show an onboarding prompt to log some reads first

## 7. First Run

```bash
cd "/Users/devin/Documents/OneShot"
npm install
npm run dev
```

- [ ] Sign up at `localhost:3000/signup`
- [ ] Scan a comic cover or manually add one via search
- [ ] Log a read on the comic detail page
- [ ] Verify Stats and Compass respond with your reading history

## 8. Deployment (Vercel)

- [x] Vercel project created (`one-shot`) and linked to GitHub repo
- [ ] Add all env vars in Vercel project settings (same as `.env.local`)
- [ ] Update `GOOGLE_REDIRECT_URI` in `.env.local` and Google Console to the production URL
