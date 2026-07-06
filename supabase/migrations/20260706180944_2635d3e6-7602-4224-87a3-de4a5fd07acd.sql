
DROP POLICY IF EXISTS "Anyone can insert shared items" ON public.shared_items;
DROP POLICY IF EXISTS "Anyone can read shared items" ON public.shared_items;

-- Purge any oversized legacy rows so the new bound applies safely
DELETE FROM public.shared_items WHERE length(content) >= 5000000;

ALTER TABLE public.shared_items
  ADD CONSTRAINT shared_items_content_size_check CHECK (length(content) < 5000000);

ALTER TABLE public.shared_items
  ADD CONSTRAINT shared_items_code_format_check CHECK (char_length(code) = 6) NOT VALID;

CREATE OR REPLACE FUNCTION public.validate_shared_item_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at must be in the future';
  END IF;
  IF NEW.expires_at > now() + interval '2 hours' THEN
    RAISE EXCEPTION 'expires_at cannot exceed 2 hours from now';
  END IF;
  IF NEW.type NOT IN ('text','file') THEN
    RAISE EXCEPTION 'invalid type';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shared_items_validate_expiry ON public.shared_items;
CREATE TRIGGER shared_items_validate_expiry
BEFORE INSERT ON public.shared_items
FOR EACH ROW EXECUTE FUNCTION public.validate_shared_item_expiry();

CREATE POLICY "Anon can insert bounded shared items"
ON public.shared_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(content) < 5000000
  AND char_length(code) = 6
  AND type IN ('text','file')
);

CREATE OR REPLACE FUNCTION public.get_shared_item(_code text)
RETURNS TABLE (
  id uuid,
  code text,
  type text,
  content text,
  file_name text,
  file_type text,
  encrypted boolean,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.code, s.type, s.content, s.file_name, s.file_type, s.encrypted, s.created_at, s.expires_at
  FROM public.shared_items s
  WHERE s.code = upper(_code)
    AND s.expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.check_shared_item_encryption(_code text)
RETURNS TABLE (found boolean, encrypted boolean, type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true, s.encrypted, s.type
  FROM public.shared_items s
  WHERE s.code = upper(_code)
    AND s.expires_at > now()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_item(text) FROM public;
REVOKE ALL ON FUNCTION public.check_shared_item_encryption(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_shared_item(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_shared_item_encryption(text) TO anon, authenticated;
