import { env } from "./env.ts";

const telegramApiBase = `https://api.telegram.org/bot${env.telegramBotToken}`;

type InlineKeyboardButton = {
  text: string;
  callback_data: string;
};

type SendMessageOptions = {
  replyMarkup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
};

const telegramFetch = async (method: string, payload: Record<string, unknown>) => {
  const response = await fetch(`${telegramApiBase}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${body}`);
  }

  return response.json();
};

export const sendTelegramMessage = async (
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {},
) => {
  return telegramFetch("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: options.replyMarkup,
  });
};

export const answerTelegramCallback = async (callbackQueryId: string, text: string) => {
  return telegramFetch("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
};
