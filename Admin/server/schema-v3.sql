-- SyntriGuard Schema v3 — Attendance & Auto Performance Scoring

-- Attendance records — tracks every clock-in/clock-out, sick days, late arrivals
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  guard_id INTEGER REFERENCES guards(id) ON DELETE CASCADE,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  scheduled_start TIME,
  actual_clock_in TIME,
  actual_clock_out TIME,
  is_late BOOLEAN DEFAULT false,
  late_minutes INTEGER DEFAULT 0,
  is_sick_call BOOLEAN DEFAULT false,
  is_no_show BOOLEAN DEFAULT false,
  is_excused BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_attendance_guard ON attendance(guard_id);
CREATE INDEX idx_attendance_date ON attendance(date);

-- Add tracking columns to guards
ALTER TABLE guards ADD COLUMN IF NOT EXISTS total_shifts_completed INTEGER DEFAULT 0;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS total_shifts_missed INTEGER DEFAULT 0;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS total_late_arrivals INTEGER DEFAULT 0;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS total_sick_days INTEGER DEFAULT 0;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS on_time_percentage DECIMAL(5,2) DEFAULT 100;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS auto_score DECIMAL(5,2);
ALTER TABLE guards ADD COLUMN IF NOT EXISTS last_score_update TIMESTAMP;
