-- Normalize legacy short-form enum values in profiles.sections to match
-- StudentProfile canonical values. Idempotent.

update public.profiles set sections = jsonb_set(
  sections, '{finance,source}',
  case sections->'finance'->>'source'
    when 'self' then '"self-funded"'::jsonb
    when 'parents' then '"parents-family"'::jsonb
    when 'loan' then '"education-loan"'::jsonb
    when 'scholarship' then '"scholarship-dependent"'::jsonb
    else sections->'finance'->'source'
  end
) where sections->'finance'->>'source' in ('self','parents','loan','scholarship');

update public.profiles set sections = jsonb_set(
  sections, '{academic,degree}',
  '"higher-secondary"'::jsonb
) where sections->'academic'->>'degree' = 'high-school';
