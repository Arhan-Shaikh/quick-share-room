
-- 1. Extend shared_items with storage tracking columns
ALTER TABLE public.shared_items
  ADD COLUMN IF NOT EXISTS storage_paths text[],
  ADD COLUMN IF NOT EXISTS file_sizes bigint[],
  ADD COLUMN IF NOT EXISTS file_names text[],
  ADD COLUMN IF NOT EXISTS file_types text[];

-- 2. Relax the INSERT policy: allow rows whose payload lives in Storage
--    (content can be short metadata JSON) but keep the 5 MB text cap.
DROP POLICY IF EXISTS "Anon can insert bounded shared items" ON public.shared_items;

CREATE POLICY "Anon can insert bounded shared items"
  ON public.shared_items
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(content) < 5000000
    AND char_length(code) = 6
    AND type = ANY (ARRAY['text'::text, 'file'::text])
  );

-- 3. Storage RLS on the `shared-files` bucket.
--    Anon can INSERT (upload) only. All reads go through the edge function
--    that uses the service role after validating the room code.
DROP POLICY IF EXISTS "Anon can upload to shared-files" ON storage.objects;
CREATE POLICY "Anon can upload to shared-files"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'shared-files');
