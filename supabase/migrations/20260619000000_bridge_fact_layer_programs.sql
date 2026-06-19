-- MV-13: bridge the reviewed TS fact layer (au-rmit-programs.ts /
-- au-university-programs.ts) into the live programs catalogue. Adds provenance
-- columns, enriches the 3 true-twin RMIT rows in place, and inserts 19 verified
-- programs (RMIT bachelors/masters + UTS Pharmacy + Melbourne Education + Deakin
-- Data Science). RMIT diplomas and Torrens programs are deferred (no ranking-safe
-- entry data). Idempotent / re-runnable.
--
-- Rollback: delete from public.programs where generated;
--           (the 3 enriched rows are additive — their finding_refs/duration can be
--            cleared separately if a full revert is needed.)
--           then: alter table public.programs drop column generated, drop column
--           finding_refs, drop column duration_years;

alter table public.programs add column if not exists duration_years numeric(3,1);
alter table public.programs add column if not exists finding_refs text[] not null default '{}';
alter table public.programs add column if not exists generated boolean not null default false;

insert into public.programs (id, university_id, name, level, field, tuition_min, tuition_max, tuition_currency, min_grade, min_english, min_english_band, intakes, source, last_verified, data_quality, notes, duration_years, finding_refs, generated) values
-- Enriched true-twin RMIT rows: adopt fact tuition/duration/source + finding refs;
-- keep existing English minimums; generated stays false.
('rmit-bit', 'rmit', 'Bachelor of IT', 'bachelors', 'computer-science', 42240, 42240, 'AUD', 65, 6.5, 6.0, ARRAY['feb','jul'], 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 3, ARRAY['E.057','E.058','E.059'], false),
('rmit-mit', 'rmit', 'Master of IT', 'masters', 'computer-science', 44160, 44160, 'AUD', 65, 6.5, 6.0, ARRAY['feb','jul'], 'https://www.rmit.edu.au/study-with-us/levels-of-study/postgraduate-study/masters-by-coursework/master-of-information-technology-mc208', '2026-06-07', 'primary', NULL, 2, ARRAY['E.051','E.054'], false),
('rmit-mds', 'rmit', 'Master of Data Science', 'masters', 'data-science', 43200, 43200, 'AUD', 65, 6.5, 6.0, ARRAY['feb','jul'], 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 2, ARRAY['E.046','E.047'], false),
-- New RMIT engineering programs.
('rmit-be-civil-infrastructure-honours', 'rmit', 'Bachelor of Engineering (Civil and Infrastructure) (Honours)', 'bachelors', 'engineering', 47040, 47040, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 4, ARRAY['E.069','E.070'], true),
('rmit-me-civil-engineering', 'rmit', 'Master of Engineering (Civil Engineering)', 'masters', 'engineering', 48000, 48000, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 2, ARRAY['E.071','E.072'], true),
('rmit-be-electrical-engineering-honours', 'rmit', 'Bachelor of Engineering (Electrical Engineering) (Honours)', 'bachelors', 'engineering', 47040, 47040, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 4, ARRAY['E.073','E.074'], true),
('rmit-me-electrical-engineering', 'rmit', 'Master of Engineering (Electrical Engineering)', 'masters', 'engineering', 48000, 48000, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 2, ARRAY['E.075','E.076'], true),
('rmit-be-mechanical-engineering-honours', 'rmit', 'Bachelor of Engineering (Mechanical Engineering) (Honours)', 'bachelors', 'engineering', 47040, 47040, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 4, ARRAY['E.077','E.078'], true),
('rmit-me-mechanical-engineering', 'rmit', 'Master of Engineering (Mechanical Engineering)', 'masters', 'engineering', 48000, 48000, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 2, ARRAY['E.079','E.080'], true),
-- New RMIT IT, business, health and education programs.
('rmit-bachelor-computer-science', 'rmit', 'Bachelor of Computer Science', 'bachelors', 'computer-science', 42240, 42240, 'AUD', 65, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 3, ARRAY['E.042','E.043','E.045'], true),
('rmit-master-cyber-security', 'rmit', 'Master of Cyber Security', 'masters', 'computer-science', 43200, 43200, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 2, ARRAY['E.055','E.056'], true),
('rmit-bachelor-business', 'rmit', 'Bachelor of Business', 'bachelors', 'business', 45120, 45120, 'AUD', 65, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 3, ARRAY['E.060','E.061','E.062'], true),
('rmit-master-professional-accounting', 'rmit', 'Master of Professional Accounting', 'masters', 'accounting', 49920, 49920, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 2, ARRAY['E.063','E.064'], true),
('rmit-master-business-administration', 'rmit', 'Master of Business Administration', 'masters', 'business', 49920, 49920, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 2, ARRAY['E.065','E.066'], true),
('rmit-master-project-management', 'rmit', 'Master of Project Management', 'masters', 'project-management', 50880, 50880, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 2, ARRAY['E.067','E.068'], true),
('rmit-bachelor-nursing', 'rmit', 'Bachelor of Nursing', 'bachelors', 'nursing', 42240, 42240, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', 'AHPRA registration required', 3, ARRAY['E.084','E.085'], true),
('rmit-bachelor-pharmacy-honours', 'rmit', 'Bachelor of Pharmacy (Honours)', 'bachelors', 'pharmacy', 48000, 48000, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 4, ARRAY['E.110','E.111'], true),
('rmit-bachelor-education-primary-early-childhood', 'rmit', 'Bachelor of Education (Primary and Early Childhood Education)', 'bachelors', 'education', 34560, 34560, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 4, ARRAY['E.092','E.093'], true),
('rmit-master-social-work', 'rmit', 'Master of Social Work', 'masters', 'social-work', 39360, 39360, 'AUD', NULL, NULL, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 2, ARRAY['E.117','E.118'], true),
-- New programs from other universities.
('uts-master-of-pharmacy', 'uts', 'Master of Pharmacy', 'masters', 'pharmacy', 38100, 38100, 'AUD', NULL, 7.0, 7.0, '{}', 'https://www.uts.edu.au/courses/master-of-pharmacy', '2026-06-07', 'primary', 'Accredited by the Australian Pharmacy Council.', NULL, ARRAY['E.101','E.102','E.103','E.104','E.105','E.106','E.107','E.108'], true),
('unimelb-master-of-education-online', 'melbourne', 'Master of Education (Online)', 'masters', 'education', 27000, 27000, 'AUD', NULL, NULL, NULL, '{}', 'https://study.unimelb.edu.au/find/courses/graduate/master-of-education-online/entry-requirements/', '2026-06-07', 'primary', NULL, NULL, ARRAY['E.100'], true),
('deakin-master-of-data-science', 'deakin', 'Master of Data Science', 'masters', 'data-science', 34400, 34400, 'AUD', NULL, NULL, NULL, '{}', 'https://www.deakin.edu.au/course/master-data-science', '2026-06-07', 'primary', NULL, NULL, ARRAY['E.049'], true)
on conflict (id) do update set
  university_id = excluded.university_id,
  name = excluded.name,
  level = excluded.level,
  field = excluded.field,
  tuition_min = excluded.tuition_min,
  tuition_max = excluded.tuition_max,
  tuition_currency = excluded.tuition_currency,
  min_grade = excluded.min_grade,
  min_english = excluded.min_english,
  min_english_band = excluded.min_english_band,
  intakes = excluded.intakes,
  source = excluded.source,
  last_verified = excluded.last_verified,
  data_quality = excluded.data_quality,
  notes = excluded.notes,
  duration_years = excluded.duration_years,
  finding_refs = excluded.finding_refs,
  generated = excluded.generated;
