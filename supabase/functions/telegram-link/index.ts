import { corsHeaders } from "../_shared/cors.ts";
import { env } from "../_shared/env.ts";
import { adminClient, userClient } from "../_shared/supabase.ts";
import type { TelegramLinkStatus } from "../_shared/types.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const generateToken = () => crypto.randomUUID().replace(/-/g, "").slice(0, 24);

const getStatus = async (userId: string): Promise<TelegramLinkStatus> => {
  const [linkResult, tokenResult] = await Promise.all([
    adminClient
      .from("telegram_links")
      .select("telegram_username, telegram_chat_id, linked_at")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient
      .from("telegram_link_tokens")
      .select("token, expires_at")
      .eq("user_id", userId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (linkResult.error) throw linkResult.error;
  if (tokenResult.error) throw tokenResult.error;

  return {
    isLinked: Boolean(linkResult.data),
    telegramUsername: linkResult.data?.telegram_username ?? null,
    telegramChatId: linkResult.data?.telegram_chat_id ? String(linkResult.data.telegram_chat_id) : null,
    linkedAt: linkResult.data?.linked_at ?? null,
    botUsername: env.telegramBotUsername,
    linkToken: tokenResult.data?.token ?? null,
    linkExpiresAt: tokenResult.data?.expires_at ?? null,
  };
};

const getUserIdFromRequest = async (request: Request) => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }

  const client = userClient(authHeader);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return user.id;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserIdFromRequest(request);

    if (request.method === "GET") {
      return json(await getStatus(userId));
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const payload = await request.json().catch(() => ({}));
    const action = payload?.action ?? "status";

    if (action === "status") {
      return json(await getStatus(userId));
    }

    if (action === "generate") {
      await adminClient
        .from("telegram_link_tokens")
        .delete()
        .eq("user_id", userId)
        .is("consumed_at", null);

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const token = generateToken();

      const { error } = await adminClient.from("telegram_link_tokens").insert({
        user_id: userId,
        token,
        expires_at: expiresAt,
      });

      if (error) throw error;

      return json(await getStatus(userId));
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      400,
    );
  }
});
