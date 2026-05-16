-- User reading preferences
CREATE TABLE user_preferences (
  user_id         uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  minutes_per_day int  NOT NULL DEFAULT 30,
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own preferences" ON user_preferences USING (auth.uid() = user_id);
