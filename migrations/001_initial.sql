PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('draft','collecting','review','finalized','failed')),
  input_json TEXT NOT NULL,
  company_name TEXT,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  cost_limit_usd REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finalized_at TEXT
);

CREATE TABLE IF NOT EXISTS source_runs (
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('maps','reviews','competitors','website','pagespeed','instagram','operator','ai')),
  status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed','skipped')),
  error TEXT,
  external_run_id TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (analysis_id, source)
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source_url TEXT,
  observed_at TEXT NOT NULL,
  screenshot_path TEXT,
  confidence REAL NOT NULL,
  category TEXT,
  assessment TEXT,
  impact TEXT,
  recommendation TEXT
);
CREATE INDEX IF NOT EXISTS evidence_analysis_idx ON evidence(analysis_id);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  evidence_ids_json TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('critical','important','opportunity','strength')),
  observation TEXT NOT NULL,
  possible_impact TEXT NOT NULL,
  recommended_direction TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS slides (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  layout TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  visual_asset_ids_json TEXT NOT NULL,
  speaker_notes TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS costs (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  amount_usd REAL NOT NULL CHECK(amount_usd >= 0),
  units REAL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_versions (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('created','findings','slides','finalized')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS analysis_versions_analysis_idx ON analysis_versions(analysis_id, created_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
