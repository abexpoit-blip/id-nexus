CREATE TABLE IF NOT EXISTS public.admin_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_user_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  sender_is_admin BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_messages_thread ON public.admin_messages(thread_user_id, created_at DESC);
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all messages" ON public.admin_messages FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "Users read own thread" ON public.admin_messages FOR SELECT
  TO authenticated USING (thread_user_id = auth.uid());
CREATE POLICY "Admins send any" ON public.admin_messages FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) AND sender_is_admin = true);
CREATE POLICY "Users send to own thread" ON public.admin_messages FOR INSERT
  TO authenticated WITH CHECK (thread_user_id = auth.uid() AND sender_id = auth.uid() AND sender_is_admin = false);
CREATE POLICY "Admins update messages" ON public.admin_messages FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "Users mark read" ON public.admin_messages FOR UPDATE
  TO authenticated USING (thread_user_id = auth.uid()) WITH CHECK (thread_user_id = auth.uid());