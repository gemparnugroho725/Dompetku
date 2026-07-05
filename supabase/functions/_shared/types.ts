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
