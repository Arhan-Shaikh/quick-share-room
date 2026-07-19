
CREATE POLICY "Anon can select shared-files for resumable uploads"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'shared-files');

CREATE POLICY "Anon can update shared-files for resumable uploads"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'shared-files')
WITH CHECK (bucket_id = 'shared-files');
