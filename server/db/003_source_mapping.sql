-- Maps Firestore document IDs to newly generated PostgreSQL IDs.
CREATE TABLE firebase_source_map (
  source_collection text NOT NULL,
  source_document_id text NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  mapped_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_collection, source_document_id, target_table)
);
