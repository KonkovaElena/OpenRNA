ALTER TABLE hla_consensus ADD COLUMN IF NOT EXISTS disagreements JSONB;
ALTER TABLE hla_consensus ADD COLUMN IF NOT EXISTS confidence_decomposition JSONB;
