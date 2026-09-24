-- ============================================================
-- Refactor: Pisah provider dan model AI
-- 1 provider (API key) bisa punya banyak model
-- ============================================================

-- Buat tabel provider
CREATE TABLE IF NOT EXISTS public.user_ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('openai_compatible', 'gemini', 'anthropic')),
  api_key TEXT NOT NULL,
  base_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_ai_providers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_ai_providers' AND policyname = 'Users can manage their own providers'
  ) THEN
    CREATE POLICY "Users can manage their own providers"
    ON public.user_ai_providers FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Drop tabel lama dan buat ulang dengan struktur baru
DROP TABLE IF EXISTS public.user_ai_models;

CREATE TABLE public.user_ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.user_ai_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  supports_vision BOOLEAN DEFAULT false NOT NULL,
  priority INT DEFAULT 1 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_ai_models ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_ai_models' AND policyname = 'Users can manage their own ai models'
  ) THEN
    CREATE POLICY "Users can manage their own ai models"
    ON public.user_ai_models FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
