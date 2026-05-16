-- One Shot — initial schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Publishers ──────────────────────────────────────────────────────────────
CREATE TABLE publishers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users ON DELETE CASCADE,
  name         text NOT NULL,
  comicvine_id text,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own publishers" ON publishers USING (auth.uid() = user_id);

-- ── Series ──────────────────────────────────────────────────────────────────
CREATE TABLE series (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users ON DELETE CASCADE,
  publisher_id uuid REFERENCES publishers ON DELETE SET NULL,
  name         text NOT NULL,
  comicvine_id text,
  description  text,
  cover_url    text,
  start_year   int,
  issue_count  int,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own series" ON series USING (auth.uid() = user_id);

-- ── Comics (issues) ─────────────────────────────────────────────────────────
CREATE TABLE comics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users ON DELETE CASCADE,
  series_id       uuid REFERENCES series ON DELETE SET NULL,
  publisher_id    uuid REFERENCES publishers ON DELETE SET NULL,
  title           text NOT NULL,
  issue_number    text,
  comicvine_id    text,
  cover_url       text,
  description     text,
  release_date    date,
  writers         text[],
  artists         text[],
  characters      text[],
  has_pdf         boolean DEFAULT false,
  drive_file_id   text,
  drive_view_url  text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE comics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own comics" ON comics USING (auth.uid() = user_id);

CREATE INDEX comics_user_series    ON comics (user_id, series_id);
CREATE INDEX comics_user_publisher ON comics (user_id, publisher_id);

-- ── Reading Log ─────────────────────────────────────────────────────────────
CREATE TABLE reading_log (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid REFERENCES auth.users ON DELETE CASCADE,
  comic_id  uuid REFERENCES comics ON DELETE CASCADE,
  read_at   timestamptz DEFAULT now(),
  notes     text
);
ALTER TABLE reading_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own reading_log" ON reading_log USING (auth.uid() = user_id);

-- ── Pull List ───────────────────────────────────────────────────────────────
CREATE TABLE pull_list (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE,
  series_id  uuid REFERENCES series ON DELETE CASCADE,
  active     boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, series_id)
);
ALTER TABLE pull_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own pull_list" ON pull_list USING (auth.uid() = user_id);

-- ── Reading Schedule ────────────────────────────────────────────────────────
CREATE TABLE reading_schedule (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users ON DELETE CASCADE,
  comic_id      uuid REFERENCES comics ON DELETE CASCADE,
  scheduled_for date NOT NULL,
  completed     boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, comic_id, scheduled_for)
);
ALTER TABLE reading_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own reading_schedule" ON reading_schedule USING (auth.uid() = user_id);
CREATE INDEX schedule_user_date ON reading_schedule (user_id, scheduled_for);

-- ── User Integrations (Google Drive tokens) ─────────────────────────────────
CREATE TABLE user_integrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE,
  provider   text NOT NULL,
  tokens     text NOT NULL,
  connected  boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own integrations" ON user_integrations USING (auth.uid() = user_id);

-- ── Weekly Releases Cache ───────────────────────────────────────────────────
-- Populated by a cron job / on-demand fetch; public read (no user_id)
CREATE TABLE weekly_releases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  series_name  text,
  publisher    text,
  issue_number text,
  cover_url    text,
  release_date date NOT NULL,
  league_id    text UNIQUE,
  fetched_at   timestamptz DEFAULT now()
);
