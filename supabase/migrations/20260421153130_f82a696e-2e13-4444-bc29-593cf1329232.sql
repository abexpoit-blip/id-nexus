
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.dispatch_notification_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://rlecdjcfrlnmnlwpcqkb.supabase.co/functions/v1/dispatch-notification',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block notification insert if telegram dispatch fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_telegram_dispatch ON public.notifications;
CREATE TRIGGER notifications_telegram_dispatch
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_notification_to_telegram();
