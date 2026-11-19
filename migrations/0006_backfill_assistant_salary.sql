DELETE FROM assistant_chunks WHERE source_type = 'opportunity';

INSERT INTO assistant_chunks (
  id,
  source_type,
  source_id,
  chunk_index,
  content,
  created_at
)
SELECT
  lower(hex(randomblob(16))),
  'opportunity',
  o.id,
  0,
  COALESCE(o.company, '') || char(10) ||
  o.title || char(10) ||
  COALESCE(o.location, '') || char(10) ||
  COALESCE(o.salary, '') || char(10) ||
  c.name || char(10) ||
  o.stage || char(10) ||
  COALESCE(o.responsibilities, '') || char(10) ||
  COALESCE(o.requirements, '') || char(10) ||
  COALESCE(o.hard_abilities, '') || char(10) ||
  COALESCE(o.general_abilities, '') || char(10) ||
  COALESCE(o.experience_requirements, '') || char(10) ||
  COALESCE(o.match_strengths, '') || char(10) ||
  COALESCE(o.match_gaps, '') || char(10) ||
  COALESCE(o.match_evidence, '') || char(10) ||
  COALESCE(o.notes, ''),
  o.updated_at
FROM opportunities o
JOIN categories c ON c.id = o.category_id;
