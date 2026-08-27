-- Older catalog entries did not always keep the artist. These aliases are only
-- added for titles that are unambiguous in the current catalog.
INSERT INTO song_tempos (lookup_key, artist, title, bpm, provider, provider_url, confidence)
VALUES (
  '|delikanlim',
  'Yıldız Tilbe',
  'Delikanlım',
  140,
  'getsongbpm',
  'https://getsongbpm.com/song/delikanlim/kzNkN',
  90
)
ON CONFLICT(lookup_key) DO UPDATE SET
  bpm = excluded.bpm,
  provider = excluded.provider,
  provider_url = excluded.provider_url,
  confidence = excluded.confidence,
  updated_at = CURRENT_TIMESTAMP;
