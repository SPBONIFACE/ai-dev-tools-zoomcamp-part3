CREATE TABLE public.interview_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'System design interview',
  candidate_name text NOT NULL DEFAULT '',
  role_title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'live',
  join_token text NOT NULL UNIQUE,
  notes text NOT NULL DEFAULT '',
  link_revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE public.board_elements (
  id uuid NOT NULL PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX board_elements_session_idx ON public.board_elements(session_id);
CREATE INDEX interview_sessions_owner_idx ON public.interview_sessions(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_sessions TO authenticated;
GRANT ALL ON public.interview_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_elements TO authenticated;
GRANT ALL ON public.board_elements TO service_role;

ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their sessions" ON public.interview_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners manage their board elements" ON public.board_elements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = session_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = session_id AND s.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER interview_sessions_touch BEFORE UPDATE ON public.interview_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER board_elements_touch BEFORE UPDATE ON public.board_elements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();