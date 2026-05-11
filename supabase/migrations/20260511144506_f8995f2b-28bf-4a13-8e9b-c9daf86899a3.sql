-- Enums
DO $$ BEGIN
  CREATE TYPE support_ticket_category AS ENUM ('order','payment','account','technical','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_status AS ENUM ('open','pending','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category support_ticket_category NOT NULL,
  subject text NOT NULL,
  status support_ticket_status NOT NULL DEFAULT 'open',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status, last_message_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users create own tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins view all tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Ticket messages
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_is_admin boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stm_ticket ON public.support_ticket_messages(ticket_id, created_at);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ticket messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );
CREATE POLICY "Users send to own tickets" ON public.support_ticket_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND sender_is_admin = false AND
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid() AND t.status <> 'closed')
  );
CREATE POLICY "Admins view all ticket messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins send to any ticket" ON public.support_ticket_messages
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin') AND sender_is_admin = true
  );

-- Admin message thread state (close/reopen seller chats)
CREATE TABLE IF NOT EXISTS public.admin_message_threads (
  user_id uuid PRIMARY KEY,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_message_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own thread state" ON public.admin_message_threads
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage thread state" ON public.admin_message_threads
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Default support_enabled setting
INSERT INTO public.app_settings(key, value)
VALUES ('support_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;