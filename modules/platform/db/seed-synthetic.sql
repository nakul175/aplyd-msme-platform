-- SYNTHETIC data only. Safe to run more than once. Never applied outside a synthetic environment.
INSERT OR IGNORE INTO companies (id, name, is_synthetic, created_at) VALUES
  ('company-synthetic-a', 'SYNTHETIC Company A', 1, '2026-10-04T00:00:00.000Z'),
  ('company-synthetic-b', 'SYNTHETIC Company B', 1, '2026-10-04T00:00:00.000Z');
INSERT OR IGNORE INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES
  ('user-synthetic-owner-a', 'company-synthetic-a', 'owner-a@synthetic.invalid', 'SYNTHETIC Owner A', 'owner', 1),
  ('user-synthetic-owner-b', 'company-synthetic-b', 'owner-b@synthetic.invalid', 'SYNTHETIC Owner B', 'owner', 1),
  ('user-synthetic-operator', NULL, 'operator@synthetic.invalid', 'SYNTHETIC Operator', 'operator', 1);
