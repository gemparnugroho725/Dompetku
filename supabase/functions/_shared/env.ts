const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

const optionalEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
};

const aerolinkApiKey = optionalEnv("AEROLINK_API_KEY");
const nararouterApiKey = optionalEnv("NARAROUTER_API_KEY");

if (!aerolinkApiKey && !nararouterApiKey) {
  throw new Error("Missing AI provider configuration: set AEROLINK_API_KEY or NARAROUTER_API_KEY");
}

export const env = {
  supabaseUrl: requiredEnv("PROJECT_URL"),
  supabaseAnonKey: requiredEnv("PROJECT_ANON_KEY"),
  supabaseServiceRoleKey: requiredEnv("PROJECT_SERVICE_ROLE_KEY"),
  telegramBotToken: requiredEnv("TELEGRAM_BOT_TOKEN"),
  telegramBotUsername: Deno.env.get("TELEGRAM_BOT_USERNAME") ?? null,
  aerolinkApiKey,
  aerolinkBaseUrl: optionalEnv("AEROLINK_BASE_URL") ?? "https://capi.aerolink.lat",
  aerolinkModel: optionalEnv("AEROLINK_MODEL") ?? "claude-opus-4-8",
  nararouterApiKey,
  nararouterBaseUrl: optionalEnv("NARAROUTER_BASE_URL") ?? "https://router.bynara.id/v1",
  nararouterModel: optionalEnv("NARAROUTER_MODEL") ?? "mistral-large",
};
