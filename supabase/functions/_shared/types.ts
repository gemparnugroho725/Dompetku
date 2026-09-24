export type ParsedTransaction = {
  type: "income" | "expense" | "transfer";
  amount: number;
  category: string;
  description: string;
  date: string;
  confidence: number;
  sourceAccountName?: string | null;
  destinationAccountName?: string | null;
};

export type TelegramLinkStatus = {
  isLinked: boolean;
  telegramUsername: string | null;
  telegramChatId: string | null;
  linkedAt: string | null;
  botUsername: string | null;
  linkToken: string | null;
  linkExpiresAt: string | null;
};

export type UserAiModel = {
  id: string;
  user_id: string;
  name: string;
  provider_type: "openai_compatible" | "gemini" | "anthropic";
  api_key: string;
  base_url?: string | null;
  model_name: string;
  supports_vision: boolean;
  priority: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};
