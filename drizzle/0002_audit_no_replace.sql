-- Closes a hole in 0001. INSERT OR REPLACE and REPLACE INTO delete a conflicting row without firing DELETE triggers
-- (SQLite runs those only when recursive_triggers is on, and it is off by default), so a plain insert that reuses an
-- existing id could overwrite an audit row. Found by independent review of slice 1 and proved against the real SQL.
-- What this cannot stop: DROP TRIGGER, DROP TABLE and ALTER TABLE. Inside SQLite nothing can. Those need database
-- permissions the application does not use, and a hash chain over the rows would make tampering detectable (not built).
CREATE TRIGGER audit_events_no_replace BEFORE INSERT ON audit_events
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM audit_events WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;
