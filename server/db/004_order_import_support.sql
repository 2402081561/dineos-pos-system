ALTER TABLE members ADD COLUMN legacy_member_id text UNIQUE;
ALTER TABLE orders ADD COLUMN legacy_source_id text UNIQUE;
