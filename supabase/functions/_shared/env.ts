const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

export const env = {
  supabaseUrl: requiredEnv("PROJECT_URL"),
  supabaseAnonKey: requiredEnv("PROJECT_ANON_KEY"),
  supabaseServiceRoleKey: requiredEnv("PROJECT_SERVICE_ROLE_KEY"),
  telegramBotToken: requiredEnv("TELEGRAM_BOT_TOKEN"),
  telegramBotUsername: Deno.env.get("TELEGRAM_BOT_USERNAME") ?? null,
  aerolinkApiKey: requiredEnv("AEROLINK_API_KEY"),
  aerolinkBaseUrl: Deno.env.get("AEROLINK_BASE_URL") ?? "https://capi.aerolink.lat",
  aerolinkModel: Deno.env.get("AEROLINK_MODEL") ?? "claude-opus-4-8",
};
