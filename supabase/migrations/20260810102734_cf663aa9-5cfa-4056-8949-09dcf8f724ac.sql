CREATE TABLE public.admin_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_backup_codes_user ON public.admin_backup_codes(user_id);
GRANT ALL ON public.admin_backup_codes TO service_role;
ALTER TABLE public.admin_backup_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to backup codes"
  ON public.admin_backup_codes FOR SELECT TO authenticated USING (false);
CREATE TRIGGER trg_admin_backup_codes_updated_at
  BEFORE UPDATE ON public.admin_backup_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.admin_mfa_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_mfa_grants_user ON public.admin_mfa_grants(user_id, expires_at);
GRANT ALL ON public.admin_mfa_grants TO service_role;
ALTER TABLE public.admin_mfa_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to recovery grants"
  ON public.admin_mfa_grants FOR SELECT TO authenticated USING (false);
CREATE TRIGGER trg_admin_mfa_grants_updated_at
  BEFORE UPDATE ON public.admin_mfa_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();