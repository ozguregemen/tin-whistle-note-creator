CREATE TABLE IF NOT EXISTS song_tempos (
  lookup_key TEXT PRIMARY KEY,
  artist TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  bpm INTEGER NOT NULL CHECK (bpm BETWEEN 40 AND 220),
  provider TEXT NOT NULL,
  provider_url TEXT NOT NULL DEFAULT '',
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS song_tempos_artist_title_idx
  ON song_tempos (artist, title);

INSERT INTO song_tempos (lookup_key, artist, title, bpm, provider, provider_url, confidence)
VALUES
  ('duman|bu aksam', 'Duman', 'Bu Akşam', 149, 'getsongbpm', 'https://getsongbpm.com/album/belki-alisman-lazim/k5D0E', 100),
  ('tarkan|dudu', 'Tarkan', 'Dudu', 90, 'getsongbpm', 'https://getsongbpm.com/album/dudu/qxBp0', 100),
  ('yildiz tilbe|delikanlim', 'Yıldız Tilbe', 'Delikanlım', 140, 'getsongbpm', 'https://getsongbpm.com/song/delikanlim/kzNkN', 100)
ON CONFLICT(lookup_key) DO NOTHING;
