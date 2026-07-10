
CREATE POLICY "Service role only reads invoices"
  ON storage.objects FOR SELECT TO authenticated
  USING (false);

CREATE POLICY "Nobody writes invoices from client"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (false);
