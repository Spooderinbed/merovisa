-- MV-21: surface 9 verified Category-E findings (E.044/E.050/E.086/E.094/E.112/
-- E.113/E.119/E.120/E.169) as program-level English (IELTS) requirements on 6
-- programs already bridged into the live catalogue by MV-13
-- (20260619000000_bridge_fact_layer_programs.sql). No new columns, no new rows —
-- only min_english / min_english_band / notes / finding_refs on 6 existing ids.
-- Idempotent / re-runnable (same upsert idiom as the MV-13 bridge migration).
--
-- Rollback: re-run the MV-13 bridge migration's insert block for these 6 ids
--           (it carries the pre-MV-21 NULL English values).

insert into public.programs (id, university_id, name, level, field, tuition_min, tuition_max, tuition_currency, min_grade, min_english, min_english_band, intakes, source, last_verified, data_quality, notes, duration_years, finding_refs, generated) values
('rmit-bachelor-computer-science', 'rmit', 'Bachelor of Computer Science', 'bachelors', 'computer-science', 42240, 42240, 'AUD', 65, 6.5, 6.0, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 3, ARRAY['E.042','E.043','E.044','E.045'], true),
('rmit-bachelor-nursing', 'rmit', 'Bachelor of Nursing', 'bachelors', 'nursing', 42240, 42240, 'AUD', NULL, 7.0, 7.0, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', 'AHPRA registration required. The July intake is restricted to applicants who completed an Australian Diploma of Nursing within the past 10 years and hold NMBA Enrolled Nurse registration.', 3, ARRAY['E.084','E.085','E.086','E.169'], true),
('rmit-bachelor-pharmacy-honours', 'rmit', 'Bachelor of Pharmacy (Honours)', 'bachelors', 'pharmacy', 48000, 48000, 'AUD', NULL, 7.0, 6.5, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 4, ARRAY['E.110','E.111','E.112','E.113'], true),
('rmit-bachelor-education-primary-early-childhood', 'rmit', 'Bachelor of Education (Primary and Early Childhood Education)', 'bachelors', 'education', 34560, 34560, 'AUD', NULL, 7.5, NULL, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 4, ARRAY['E.092','E.093','E.094'], true),
('rmit-master-social-work', 'rmit', 'Master of Social Work', 'masters', 'social-work', 39360, 39360, 'AUD', NULL, 7.0, 7.0, '{}', 'https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf', '2026-06-07', 'primary', NULL, 2, ARRAY['E.117','E.118','E.119','E.120'], true),
('deakin-master-of-data-science', 'deakin', 'Master of Data Science', 'masters', 'data-science', 34400, 34400, 'AUD', NULL, 6.5, 6.0, '{}', 'https://www.deakin.edu.au/course/master-data-science', '2026-06-07', 'primary', NULL, NULL, ARRAY['E.049','E.050'], true)
on conflict (id) do update set
  min_english = excluded.min_english,
  min_english_band = excluded.min_english_band,
  notes = excluded.notes,
  finding_refs = excluded.finding_refs;
