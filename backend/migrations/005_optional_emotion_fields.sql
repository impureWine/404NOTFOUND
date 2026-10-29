-- Preserve an explicit choice to skip emotion naming or intensity.
ALTER TABLE emotion_records ALTER COLUMN intensity DROP NOT NULL;
ALTER TABLE emotion_records DROP CONSTRAINT ck_emotion_records_codes_count;
ALTER TABLE emotion_records ADD CONSTRAINT ck_emotion_records_codes_count CHECK (cardinality(emotion_codes) BETWEEN 0 AND 5);
