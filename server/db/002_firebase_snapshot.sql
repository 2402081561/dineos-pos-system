-- Immutable source snapshot for the Firebase-to-PostgreSQL migration.
-- It preserves Firestore document IDs and fields exactly enough for later,
-- deliberate mapping into the normalized PostgreSQL tables.
CREATE TABLE firebase_import_documents (
  source_collection text NOT NULL,
  source_document_id text NOT NULL,
  source_data jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_collection, source_document_id)
);

CREATE INDEX firebase_import_documents_collection_idx ON firebase_import_documents (source_collection);
