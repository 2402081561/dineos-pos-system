-- A Supabase Auth user is linked to exactly one application role.
-- Roles are evaluated by the API from this table, never accepted from a client.
ALTER TABLE users ADD COLUMN auth_user_id uuid UNIQUE;
CREATE INDEX users_auth_user_id_idx ON users (auth_user_id);
