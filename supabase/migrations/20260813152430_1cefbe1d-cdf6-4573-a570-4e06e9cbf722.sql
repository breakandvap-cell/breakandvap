CREATE TYPE public.stock_notification_channel AS ENUM ('email', 'sms', 'both');
CREATE TYPE public.stock_notification_status AS ENUM ('pending', 'sent', 'cancelled');

CREATE TABLE public.stock_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  email text,
  phone text,
  channel public.stock_notification_channel NOT NULL DEFAULT 'email',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.stock_notification_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  CONSTRAINT stock_notifications_contact_check CHECK (
    (channel = 'email' AND email IS NOT NULL)
    OR (channel = 'sms' AND phone IS NOT NULL)
    OR (channel = 'both' AND email IS NOT NULL AND phone IS NOT NULL)
  )
);

GRANT SELECT, INSERT ON public.stock_notifications TO anon;
GRANT SELECT, INSERT, UPDATE ON public.stock_notifications TO authenticated;
GRANT ALL ON public.stock_notifications TO service_role;

ALTER TABLE public.stock_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe to a restock alert"
  ON public.stock_notifications FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND notified_at IS NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY "Users can view their own restock alerts"
  ON public.stock_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can cancel their own restock alerts"
  ON public.stock_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX stock_notifications_unique_pending
  ON public.stock_notifications (
    product_id,
    COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(COALESCE(email, '')),
    COALESCE(phone, '')
  )
  WHERE status = 'pending';

CREATE INDEX stock_notifications_pending_product_idx
  ON public.stock_notifications (product_id, status);

CREATE TRIGGER trg_stock_notifications_updated_at
  BEFORE UPDATE ON public.stock_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();