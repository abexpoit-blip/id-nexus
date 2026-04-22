-- Enable pgcrypto so gen_random_bytes() works (used by generate_tg_link_code)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Make generate_tg_link_code resilient: use schema-qualified call
CREATE OR REPLACE FUNCTION public.generate_tg_link_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  code TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    code := upper(substr(encode(extensions.gen_random_bytes(6), 'base64'), 1, 8));
    code := regexp_replace(code, '[^A-Z0-9]', 'X', 'g');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE telegram_link_code = code) OR attempts > 5;
    attempts := attempts + 1;
  END LOOP;
  RETURN code;
END;
$function$;