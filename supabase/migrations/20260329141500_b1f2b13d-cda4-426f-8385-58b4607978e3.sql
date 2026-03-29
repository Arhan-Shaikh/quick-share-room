ALTER TABLE public.shared_items DROP CONSTRAINT shared_items_type_check;
ALTER TABLE public.shared_items ADD COLUMN encrypted boolean NOT NULL DEFAULT false;
ALTER TABLE public.shared_items ADD CONSTRAINT shared_items_type_check CHECK (type = ANY (ARRAY['text'::text, 'file'::text]));