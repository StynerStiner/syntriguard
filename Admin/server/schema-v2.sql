-- SyntriGuard Schema v2 — Schedule Change Tracking & Sheet Registry
-- Run this in Supabase SQL Editor AFTER schema.sql

-- ═══ SHIFT REVISIONS — Track all schedule changes ═══
CREATE TABLE shift_revisions (
  id SERIAL PRIMARY KEY,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL DEFAULT 1,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_by_ai BOOLEAN DEFAULT false,
  old_guard_id INTEGER REFERENCES guards(id),
  new_guard_id INTEGER REFERENCES guards(id),
  old_site_id INTEGER REFERENCES sites(id),
  new_site_id INTEGER REFERENCES sites(id),
  old_start_time TIME,
  new_start_time TIME,
  old_end_time TIME,
  new_end_time TIME,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shift_revisions_shift ON shift_revisions(shift_id);
CREATE INDEX idx_shift_revisions_date ON shift_revisions(created_at);

-- Add revision tracking columns to shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS last_modified_by INTEGER REFERENCES users(id);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP;

-- ═══ SHEET REGISTRY — Track Google Sheets per month/type ═══
CREATE TABLE sheet_registry (
  id SERIAL PRIMARY KEY,
  sheet_type VARCHAR(50) NOT NULL,
  period VARCHAR(20),
  spreadsheet_id VARCHAR(255) NOT NULL,
  spreadsheet_url TEXT,
  folder_id VARCHAR(255),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_sheet_registry_unique ON sheet_registry(sheet_type, period);
