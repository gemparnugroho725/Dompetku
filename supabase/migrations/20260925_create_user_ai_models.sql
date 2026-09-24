-- Create user_ai_models table for custom AI providers & models per user
CREATE TABLE IF NOT EXISTS public.user_ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('openai_compatible', 'gemini', 'anthropic')),
  api_key TEXT NOT NULL,
  base_url TEXT,
  model_name TEXT NOT NULL,
  supports_vision BOOLEAN DEFAULT false NOT NULL,
  priority INT DEFAULT 1 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_ai_models ENABLE ROW LEVEL SECURITY;

-- Create Policy
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_ai_models' AND policyname = 'Users can manage their own user ai models'
  ) THEN
    CREATE POLICY "Users can manage their own user ai models"
    ON public.user_ai_models FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
