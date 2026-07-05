import { env } from "./env.ts";
import type { ParsedTransaction } from "./types.ts";

const TODAY_TIMEZONE = "Asia/Bangkok";

const getTodayDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TODAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const hasExplicitDateReference = (message: string) => {
  const normalized = message.toLowerCase();

  return [
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
    /\b(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b/,
    /\b(today|hari ini|kemarin|yesterday|besok|tomorrow)\b/,
    /\b(senin|selasa|rabu|kamis|jumat|sabtu|minggu)\b/,
  ].some((pattern) => pattern.test(normalized));
};

const extractJsonObject = (text: string) => {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("AI response did not contain a JSON object");
  }

  return text.slice(firstBrace, lastBrace + 1);
};

const parseAmount = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return Number.NaN;
  }

  const cleaned = value
    .replace(/rp/gi, "")
    .replace(/[^0-9,.-]/g, "")
    .trim();

  if (!cleaned) {
    return Number.NaN;
  }

  const normalized = cleaned
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(/,/g, ".");

  return Number(normalized);
};

const inferAmountFromMessage = (message: string) => {
  const normalized = message.toLowerCase();
  const matches = [
    ...normalized.matchAll(/(\d[\d.,]*)\s*(rb|ribu|jt|juta|k)\b/g),
  ];

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const base = parseAmount(lastMatch[1]);
    const multiplierToken = lastMatch[2];

    if (Number.isFinite(base)) {
      const multiplier =
        multiplierToken === "jt" || multiplierToken === "juta"
          ? 1_000_000
          : 1_000;
      return base * multiplier;
    }
  }

  const plainMatches = [...normalized.matchAll(/\d[\d.,]*/g)];
  if (plainMatches.length === 0) {
    return Number.NaN;
  }

  return parseAmount(plainMatches[plainMatches.length - 1][0]);
};

const normalizeParsedTransaction = (payload: Record<string, unknown>, sourceMessage: string): ParsedTransaction => {
  const parsedAmount = parseAmount(payload.amount);
  const amount = Number.isFinite(parsedAmount) && parsedAmount > 0
    ? parsedAmount
    : inferAmountFromMessage(sourceMessage);
  const confidence = Number(payload.confidence ?? 0);

  if (!["income", "expense"].includes(String(payload.type))) {
    throw new Error("Invalid transaction type returned by AI");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid amount returned by AI");
  }

  return {
    type: payload.type as "income" | "expense",
    amount,
    category: String(payload.category ?? "").trim() || "Lainnya",
    description: String(payload.description ?? "").trim() || "Catatan dari Telegram",
    date: String(payload.date ?? new Date().toISOString().slice(0, 10)),
    confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0,
  };
};

export const analyzeTransactionText = async (message: string): Promise<ParsedTransaction> => {
  const todayDate = getTodayDate();
  const shouldForceToday = !hasExplicitDateReference(message);

  const prompt = [
    "Kamu menganalisis chat keuangan pribadi dalam bahasa Indonesia.",
    "Balas HANYA JSON valid tanpa markdown, tanpa penjelasan tambahan.",
    "Gunakan schema ini:",
    '{"type":"income|expense","amount":15000,"category":"nama kategori","description":"deskripsi singkat","date":"YYYY-MM-DD","confidence":0.0}',
    "Aturan:",
    "- type hanya income atau expense",
    "- amount harus angka bulat tanpa titik/koma",
    "- category harus singkat dan relevan",
    "- description merangkum transaksi user",
    `- tanggal hari ini adalah ${todayDate}`,
    `- jika user tidak menyebut tanggal secara eksplisit, WAJIB pakai tanggal ${todayDate}`,
    "- confidence rentang 0 sampai 1",
    "",
    `Pesan user: ${message}`,
  ].join("\n");

  const response = await fetch(`${env.aerolinkBaseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.aerolinkApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.aerolinkModel,
      max_tokens: 300,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Aerolink request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const textContent = Array.isArray(data.content)
    ? data.content
        .filter((item: { type?: string }) => item.type === "text")
        .map((item: { text?: string }) => item.text ?? "")
        .join("\n")
    : "";

  const parsedText = extractJsonObject(textContent);
  const parsed = normalizeParsedTransaction(JSON.parse(parsedText), message);

  if (shouldForceToday) {
    parsed.date = todayDate;
  }

  return parsed;
};
