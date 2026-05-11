CREATE TABLE IF NOT EXISTS public.admin_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_user_id UUID NOT NULL,
  author_id UUID,
  author_email TEXT,
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_notes_subject ON public.admin_notes(subject_user_id, created_at DESC);
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view notes" ON public.admin_notes FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "Admins insert notes" ON public.admin_notes FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "Admins update notes" ON public.admin_notes FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "Admins delete notes" ON public.admin_notes FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER trg_admin_notes_updated
  BEFORE UPDATE ON public.admin_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();