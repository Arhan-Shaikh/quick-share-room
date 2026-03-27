-- Create shared_items table for cross-device ephemeral sharing
CREATE TABLE public.shared_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('text', 'file')),
  content TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Enable RLS
ALTER TABLE public.shared_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read shared items (no auth required)
CREATE POLICY "Anyone can read shared items"
  ON public.shared_items FOR SELECT
  USING (expires_at > now());

-- Anyone can create shared items
CREATE POLICY "Anyone can insert shared items"
  ON public.shared_items FOR INSERT
  WITH CHECK (true);

-- Create index on code for fast lookups
CREATE INDEX idx_shared_items_code ON public.shared_items (code);

-- Create index on expires_at for cleanup
CREATE INDEX idx_shared_items_expires_at ON public.shared_items (expires_at);