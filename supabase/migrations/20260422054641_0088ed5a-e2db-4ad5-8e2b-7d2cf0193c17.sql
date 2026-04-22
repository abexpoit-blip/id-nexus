-- Create dedicated extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- pg_net doesn't support ALTER EXTENSION ... SET SCHEMA, so drop + recreate in extensions
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Update dispatch trigger function with explicit schema search path
CREATE OR REPLACE FUNCTION public.dispatch_notification_to_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM extensions.http_post(
    url := 'https://rlecdjcfrlnmnlwpcqkb.supabase.co/functions/v1/dispatch-notification',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;