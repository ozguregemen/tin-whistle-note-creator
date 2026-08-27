INSERT INTO song_tempos (lookup_key, artist, title, bpm, provider, provider_url, confidence)
VALUES (
  'tarkan|kuzu kuzu',
  'Tarkan',
  'Kuzu Kuzu',
  93,
  'getsongbpm',
  'https://getsongbpm.com/album/karma/o34j',
  100
)
ON CONFLICT(lookup_key) DO UPDATE SET
  bpm = excluded.bpm,
  provider = excluded.provider,
  provider_url = excluded.provider_url,
  confidence = excluded.confidence,
  updated_at = CURRENT_TIMESTAMP;
