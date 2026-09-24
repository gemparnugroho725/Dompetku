import { adminClient } from "./supabase.ts";
import { env } from "./env.ts";
import type { ParsedTransaction, UserAiModel } from "./types.ts";

const TODAY_TIMEZONE = "Asia/Bangkok";
type ProviderName = string;

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

  const parsedType = String(payload.type);

  if (!["income", "expense", "transfer"].includes(parsedType)) {
    throw new Error("Invalid transaction type returned by AI");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid amount returned by AI");
  }

  return {
    type: parsedType as "income" | "expense" | "transfer",
    amount,
    category: parsedType === "transfer"
      ? "Transfer Antar Akun"
      : String(payload.category ?? "").trim() || "Lainnya",
    description: String(payload.description ?? "").trim() || "Catatan dari Telegram",
    date: String(payload.date ?? new Date().toISOString().slice(0, 10)),
    confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0,
    sourceAccountName: String(payload.source_account ?? "").trim() || null,
    destinationAccountName: String(payload.destination_account ?? "").trim() || null,
  };
};

const extractOpenAICompatibleText = (content: unknown) => {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }

      return "";
    })
    .join("\n")
    .trim();
};

const requestAerolink = async (prompt: string, maxTokens: number, temperature: number) => {
  if (!env.aerolinkApiKey) {
    throw new Error("Aerolink is not configured");
  }

  const response = await fetch(`${env.aerolinkBaseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.aerolinkApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.aerolinkModel,
      max_tokens: maxTokens,
      temperature,
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
        .trim()
    : "";

  if (!textContent) {
    throw new Error("Aerolink response was empty");
  }

  return textContent;
};

const requestCustomModel = async (
  model: UserAiModel,
  prompt: string,
  maxTokens: number,
  temperature: number,
  imageUrl?: string,
) => {
  const provider = model.provider;
  if (!provider) throw new Error(`[${model.name}] Provider data missing (join failed)`);

  const providerType = provider.provider_type;
  const apiKey = provider.api_key;

  if (providerType === "gemini") {
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
      { text: prompt },
    ];
    if (imageUrl) {
      parts.push({ inline_data: { mime_type: "image/jpeg", data: imageUrl } });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model.model_name}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`[${model.name}] Gemini API ${response.status}: ${body}`);
    }

    const data = await response.json();
    const textContent = extractOpenAICompatibleText(data.candidates?.[0]?.content?.parts?.[0]?.text);
    if (!textContent) throw new Error(`[${model.name}] Empty Gemini response`);
    return textContent;
  }

  if (providerType === "openai_compatible") {
    const baseUrl = (provider.base_url || "https://api.openai.com/v1").replace(/\/$/, "");
    const userContent = imageUrl
      ? [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: imageUrl.startsWith("data:") ? imageUrl : `data:image/jpeg;base64,${imageUrl}`,
            },
          },
        ]
      : prompt;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.model_name,
        temperature,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: "Kamu adalah asisten AI pencatat keuangan. Balas HANYA JSON valid.",
          },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`[${model.name}] AI Provider ${response.status}: ${body}`);
    }

    const data = await response.json();
    const textContent = extractOpenAICompatibleText(data.choices?.[0]?.message?.content);
    if (!textContent) throw new Error(`[${model.name}] Empty AI response`);
    return textContent;
  }

  throw new Error(`Unsupported provider type: ${providerType}`);
};

const getUserAiModels = async (userId: string): Promise<UserAiModel[]> => {
  try {
    const { data, error } = await adminClient
      .from("user_ai_models")
      .select("*, provider:user_ai_providers(*)")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("priority", { ascending: true });

    if (error) {
      console.warn("Could not load user_ai_models:", error.message);
      return [];
    }

    return data ?? [];
  } catch (err) {
    console.warn("Failed to fetch user_ai_models:", err);
    return [];
  }
};

const requestNaraRouter = async (
  prompt: string,
  maxTokens: number,
  temperature: number,
  imageUrl?: string,
) => {
  if (!env.nararouterApiKey) {
    throw new Error("NaraRouter is not configured");
  }

  const userContent = imageUrl
    ? [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: imageUrl.startsWith("data:") ? imageUrl : `data:image/jpeg;base64,${imageUrl}`,
          },
        },
      ]
    : prompt;

  const response = await fetch(`${env.nararouterBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.nararouterApiKey}`,
    },
    body: JSON.stringify({
      model: env.nararouterModel,
      temperature,
      max_tokens: maxTokens,
      messages: [
        {
          role: "system",
          content: "Kamu adalah asisten AI untuk pencatatan keuangan pribadi. Ikuti format JSON dengan ketat.",
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NaraRouter request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const textContent = extractOpenAICompatibleText(data.choices?.[0]?.message?.content);

  if (!textContent) {
    throw new Error("NaraRouter response was empty");
  }

  return textContent;
};

const requestGemini = async (prompt: string, maxTokens: number, temperature: number, imageUrl?: string) => {
  if (!env.geminiApiKey) {
    throw new Error("Gemini is not configured");
  }

  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
    { text: prompt },
  ];

  if (imageUrl) {
    parts.push({ inline_data: { mime_type: "image/jpeg", data: imageUrl } });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModelVision}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const textContent = extractOpenAICompatibleText(data.candidates?.[0]?.content?.parts?.[0]?.text);

  if (!textContent) {
    throw new Error("Gemini response was empty");
  }

  return textContent;
};

const shouldFallbackFromAerolinkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return [
    "Aerolink request failed: 401",
    "Aerolink request failed: 403",
    "Aerolink request failed: 429",
    "Aerolink request failed: 500",
    "Aerolink request failed: 502",
    "Aerolink request failed: 503",
    "Free access is busy right now",
    "only accepts requests from the official Claude Code CLI",
  ].some((needle) => message.includes(needle));
};

const runWithProviders = async (
  prompt: string,
  maxTokens: number,
  temperature: number,
  imageUrl?: string,
  userId?: string,
) => {
  const errors: string[] = [];

  // 1. Try User Custom AI Models (rolling in priority order)
  if (userId) {
    const customModels = await getUserAiModels(userId);
    const applicableModels = imageUrl
      ? customModels.filter((m) => m.supports_vision || m.provider?.provider_type === "gemini")
      : customModels;

    for (const model of applicableModels) {
      try {
        console.log(`[Rolling AI] Executing user custom model: ${model.name} (${model.model_name})`);
        const text = await requestCustomModel(model, prompt, maxTokens, temperature, imageUrl);
        return {
          provider: model.name as ProviderName,
          text,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        console.warn(`[Rolling AI] Custom model ${model.name} failed. Rolling to next...`, message);
      }
    }
  }

  // 2. Default System NaraRouter (Primary default)
  if (env.nararouterApiKey) {
    try {
      return {
        provider: "NaraRouter" as ProviderName,
        text: await requestNaraRouter(prompt, maxTokens, temperature, imageUrl),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "Unknown NaraRouter error");
      errors.push(message);
      console.warn("Default NaraRouter failed, rolling to Gemini...", message);
    }
  }

  // 3. System Gemini (Secondary fallback)
  if (env.geminiApiKey) {
    try {
      return {
        provider: "Gemini" as ProviderName,
        text: await requestGemini(prompt, maxTokens, temperature, imageUrl),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "Unknown Gemini error");
      errors.push(message);
    }
  }

  throw new Error(`Semua AI provider gagal: ${errors.join(" | ") || "Tidak ada provider AI yang aktif"}`);
};

export const analyzeTransactionText = async (
  message: string,
  imageUrl?: string,
  userId?: string,
): Promise<ParsedTransaction> => {
  const todayDate = getTodayDate();
  const shouldForceToday = !hasExplicitDateReference(message);

  const prompt = [
    "Kamu menganalisis chat keuangan pribadi dalam bahasa Indonesia.",
    "Balas HANYA JSON valid tanpa markdown, tanpa penjelasan tambahan.",
    "Gunakan schema ini:",
    '{"type":"income|expense|transfer","amount":15000,"category":"nama kategori atau Transfer Antar Akun","description":"deskripsi singkat","date":"YYYY-MM-DD","confidence":0.0,"source_account":"nama akun asal atau null","destination_account":"nama akun tujuan atau null"}',
    "Aturan:",
    "- type hanya income, expense, atau transfer",
    "- gunakan transfer jika uang hanya pindah antar akun milik user sendiri",
    "- contoh transfer: 'masuk cash dari BRI', 'tarik tunai dari BCA', 'transfer BRI ke Dana 50000'",
    "- amount harus angka bulat tanpa titik/koma",
    "- category harus singkat dan relevan, kecuali transfer pakai 'Transfer Antar Akun'",
    "- description merangkum transaksi user",
    "- source_account diisi kalau akun asal disebut user",
    "- destination_account diisi kalau akun tujuan disebut user",
    `- tanggal hari ini adalah ${todayDate}`,
    `- jika user tidak menyebut tanggal secara eksplisit, WAJIB pakai tanggal ${todayDate}`,
    "- confidence rentang 0 sampai 1",
    "",
    imageUrl ? `Analisis gambar struk ini dan sesuaikan dengan pesan user (jika ada): ${message}` : `Pesan user: ${message}`,
  ].join("\n");

  const result = await runWithProviders(prompt, 300, 0, imageUrl, userId);
  console.log(`Transaction analysis provider: ${result.provider}`);

  const parsedText = extractJsonObject(result.text);
  const parsed = normalizeParsedTransaction(JSON.parse(parsedText), message);

  if (shouldForceToday) {
    parsed.date = todayDate;
  }

  return parsed;
};

export const generateAuditRecommendation = async (input: {
  periodLabel: string;
  income: number;
  expense: number;
  net: number;
  budgetUsage: number | null;
  topCategoryName: string | null;
  topCategoryAmount: number;
  transactionCount: number;
}) => {
  const prompt = [
    "Kamu adalah auditor keuangan pribadi yang ringkas dan praktis.",
    "Balas dalam bahasa Indonesia.",
    "Tulis maksimal 3 poin rekomendasi.",
    "Fokus pada apakah pengeluaran masih sehat, apakah ada tanda berlebihan, dan saran tindakan berikutnya.",
    "Jangan pakai markdown table.",
    "",
    `Periode: ${input.periodLabel}`,
    `Jumlah transaksi: ${input.transactionCount}`,
    `Pemasukan: ${input.income}`,
    `Pengeluaran: ${input.expense}`,
    `Selisih: ${input.net}`,
    `Pemakaian budget bulanan: ${input.budgetUsage === null ? "tidak tersedia" : `${input.budgetUsage.toFixed(0)}%`}`,
    `Kategori pengeluaran terbesar: ${input.topCategoryName ?? "tidak ada"} (${input.topCategoryAmount})`,
    "",
    "Format balasan:",
    "Rekomendasi:",
    "1. ...",
    "2. ...",
    "3. ...",
  ].join("\n");

  const result = await runWithProviders(prompt, 250, 0.2);
  console.log(`Audit recommendation provider: ${result.provider}`);
  return result.text.trim();
};