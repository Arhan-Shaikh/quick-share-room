DROP POLICY IF EXISTS "Anon can update shared-files for resumable uploads" ON storage.objects;
DROP POLICY IF EXISTS "Anon can upload to shared-files" ON storage.objects;
CREATE POLICY "Anon can upload to shared-files"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'shared-files'
    AND name ~ '^[A-Z0-9]{6}/[0-9]{1,3}-[0-9a-f]{16}-[A-Za-z0-9_.\-]{1,80}$'
  );