-- SYNTHETIC data only. Safe to run more than once: the row is added only when the company has no revision yet
-- (INSERT OR IGNORE would not do, because the append-only trigger refuses an insert that collides with a row).
-- Company A has one confirmed description. Company B has none, so an empty record can be shown.
INSERT INTO factory_revisions (company_id, revision_no, created_at, created_by, confirmed, questionnaire_version, answers, note)
SELECT 'company-synthetic-a', 1, '2026-10-04T00:00:00.000Z', 'user-synthetic-owner-a', 1, 1,
  '{"sector":"textiles_garments","products":"SYNTHETIC school uniforms and cotton shirts","year_started":2009,"employees":"10_49","shifts":"one","state":"SYNTHETIC State","district":"SYNTHETIC District","processes":["cutting","stitching_assembly","packaging","storage_dispatch"],"equipment":"SYNTHETIC 24 sewing machines and 2 cutting tables","orders_in":["phone_whatsapp","agents_traders"],"production_tracking":"paper","quality_checks":"visual","maintenance":"when_it_breaks","accounts":"accounting_software","inventory":"paper","it_support":"owner_or_family","connectivity":"unreliable","data_kept":["customer_orders","energy_bills"],"problems":["late_deliveries","rejects_rework","payment_delays"],"own_words":"SYNTHETIC text. Orders are late because cutting waits for cloth, and rework is high at the end of each month.","budget_band":"1_to_5_lakh","decides":"owner_family","readiness":"within_year"}',
  'SYNTHETIC first description'
WHERE NOT EXISTS (SELECT 1 FROM factory_revisions WHERE company_id = 'company-synthetic-a');
