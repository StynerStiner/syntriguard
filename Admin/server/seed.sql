-- SyntriGuard Seed Data
-- Run this in Supabase SQL Editor AFTER schema.sql

-- Seed the admin user (password: Admin123!)
UPDATE users SET password_hash = '$2a$10$8K1p/a4Y0lKPHG7Nxf7sNeHkH5FuT1Mf7l4xB8HvMGFy8yFqyZ9a' WHERE email = 'admin@syntriguard.sr';

-- Insert clients
INSERT INTO clients (name, address, district, status, contract_value_srd) VALUES
('Government of Suriname', 'Kleine Combeweg 2', 'Paramaribo', 'active', 185000),
('Havenbeheer Suriname', 'Waterkant 138', 'Paramaribo', 'active', 142000),
('Staatsolie NV', 'Dr. Ir. H.S. Adhinstraat 21, Flora', 'Saramacca', 'active', 118000),
('Hakrinbank NV', 'Domineestraat 26', 'Paramaribo', 'active', 86000),
('Luchthavenbeheer', 'Zanderij, Para District', 'Para', 'pending', 135000),
('Assuria NV', 'Cornelis Jongbawstraat 16', 'Paramaribo', 'active', 62000),
('Fernandes Group', 'Industrieweg 4, Uitvlugt', 'Wanica', 'active', 48000),
('IAMGOLD Suriname', 'Brokopondo District, km 74', 'Brokopondo', 'proposal', 210000),
('Newmont Suriname', 'Nassau Mountains, Sipaliwini', 'Sipaliwini', 'proposal', 275000);

-- Insert sites
INSERT INTO sites (client_id, name, address, district, latitude, longitude, guards_assigned, status) VALUES
(1, 'Presidential Palace', 'Kleine Combeweg 2, Paramaribo', 'Paramaribo', 5.8295, -55.1677, 14, 'active'),
(2, 'Port of Paramaribo', 'Waterkant 138, Paramaribo', 'Paramaribo', 5.8550, -55.2150, 10, 'active'),
(3, 'Staatsolie HQ', 'Dr. Ir. H.S. Adhinstraat 21, Flora', 'Saramacca', 5.8750, -55.1600, 8, 'active'),
(4, 'Hakrinbank Main', 'Domineestraat 26, Paramaribo', 'Paramaribo', 5.8420, -55.2050, 6, 'active'),
(5, 'Johan Adolf Pengel Airport', 'Zanderij, Para District', 'Para', 5.4531, -55.1879, 10, 'pending'),
(6, 'Assuria Tower', 'Cornelis Jongbawstraat 16, Paramaribo', 'Paramaribo', 5.8350, -55.2000, 4, 'active'),
(7, 'Fernandes Bottling Plant', 'Industrieweg 4, Uitvlugt', 'Wanica', 5.8100, -55.2400, 3, 'active');

-- Insert guards
INSERT INTO guards (guard_id, full_name, role, assigned_site_id, phone, status, performance_score) VALUES
('G-001', 'Marcus Redan', 'Lead Guard', 1, '+597 861-4401', 'on_duty', 96),
('G-002', 'Priya Nankoe', 'Site Guard', 2, '+597 861-4402', 'on_duty', 94),
('G-003', 'Devon Figueira', 'Night Guard', 3, '+597 861-4403', 'off_duty', 91),
('G-004', 'Aisha Jagessar', 'Patrol Guard', 4, '+597 861-4404', 'on_duty', 93),
('G-005', 'Remy Sedoc', 'Trainee', 5, '+597 861-4405', 'on_duty', 87),
('G-006', 'Keon Bouva', 'Site Guard', 1, '+597 861-4406', 'on_leave', 90),
('G-007', 'Felicia Amania', 'Patrol Guard', 2, '+597 861-4407', 'on_duty', 95),
('G-008', 'Dwayne Kartopawiro', 'Night Guard', 5, '+597 861-4408', 'off_duty', 89),
('G-009', 'Shanaya Perkash', 'Site Guard', 3, '+597 861-4409', 'on_duty', 92),
('G-010', 'Ronaldo Esajas', 'Lead Guard', 4, '+597 861-4410', 'on_duty', 97),
('G-011', 'Mirella Tewari', 'Trainee', 1, '+597 861-4411', 'on_duty', 85),
('G-012', 'Cedric Wielzen', 'Site Guard', 5, '+597 861-4412', 'unassigned', NULL);

-- Insert sample incidents
INSERT INTO incidents (incident_id, type, severity, status, site_id, guard_id, description, filed_at) VALUES
('INC-052', 'Unauthorized Entry', 'critical', 'open', 1, 1, 'Unidentified individual attempted rear gate access during shift change. Guard responded within 90 seconds.', NOW() - INTERVAL '1 day'),
('INC-051', 'Perimeter Breach', 'high', 'open', 2, 2, 'Fence breach detected at dock 3 perimeter.', NOW() - INTERVAL '2 days'),
('INC-050', 'Equipment Theft', 'high', 'investigating', 3, 3, 'Radio equipment missing from guard station.', NOW() - INTERVAL '3 days'),
('INC-049', 'Disturbance', 'medium', 'resolved', 4, 4, 'Verbal altercation between visitors in lobby.', NOW() - INTERVAL '4 days'),
('INC-048', 'False Alarm', 'low', 'closed', 5, 5, 'Motion sensor triggered by wildlife.', NOW() - INTERVAL '5 days');
