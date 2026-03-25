-- SyntriGuard Database Schema
-- Run this in Supabase SQL Editor

-- Users table (login/auth)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'guard', 'client')),
  avatar_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Clients table
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address TEXT,
  district VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'proposal', 'inactive')),
  contract_value_srd DECIMAL(12,2),
  contract_type VARCHAR(50) DEFAULT 'monthly',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sites table
CREATE TABLE sites (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  district VARCHAR(100),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  guards_assigned INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'inactive', 'elevated')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Guards table
CREATE TABLE guards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guard_id VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL,
  assigned_site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('on_duty', 'off_duty', 'on_leave', 'unassigned', 'active', 'terminated')),
  hire_date DATE,
  performance_score DECIMAL(5,2),
  avatar_url VARCHAR(500),
  emergency_contact VARCHAR(255),
  emergency_phone VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Shifts table
CREATE TABLE shifts (
  id SERIAL PRIMARY KEY,
  guard_id INTEGER REFERENCES guards(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  shift_type VARCHAR(50) CHECK (shift_type IN ('morning', 'afternoon', 'overnight', 'training', 'on_call', 'critical')),
  status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'missed', 'cancelled', 'in_progress')),
  clock_in TIMESTAMP,
  clock_out TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Incidents table
CREATE TABLE incidents (
  id SERIAL PRIMARY KEY,
  incident_id VARCHAR(20) UNIQUE NOT NULL,
  type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  guard_id INTEGER REFERENCES guards(id) ON DELETE SET NULL,
  description TEXT,
  specific_location VARCHAR(255),
  damages_srd DECIMAL(12,2),
  police_notified VARCHAR(20) DEFAULT 'no',
  followup_required BOOLEAN DEFAULT false,
  evidence_urls TEXT[],
  recovery_date DATE,
  additional_notes TEXT,
  filed_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  receiver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  message_type VARCHAR(50) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI Conversations table
CREATE TABLE ai_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI Messages table
CREATE TABLE ai_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit log
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_shifts_guard ON shifts(guard_id);
CREATE INDEX idx_shifts_site ON shifts(site_id);
CREATE INDEX idx_shifts_date ON shifts(shift_date);
CREATE INDEX idx_incidents_site ON incidents(site_id);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_receiver ON messages(receiver_id);
CREATE INDEX idx_guards_site ON guards(assigned_site_id);
CREATE INDEX idx_ai_messages_conv ON ai_messages(conversation_id);

-- Seed admin user (password: Admin123!)
INSERT INTO users (email, password_hash, full_name, role) VALUES
('admin@syntriguard.sr', '$2a$10$placeholder', 'Operations Admin', 'admin');
