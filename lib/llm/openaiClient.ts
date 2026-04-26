import OpenAI from "openai";

let cachedApiKey: string | null = null;
let cachedClient: OpenAI | null = null;

export function getOpenAIClient(apiKey = process.env.OPENAI_API_KEY): OpenAI | null {
  const normalizedApiKey = apiKey?.trim() ?? "";

  if (!normalizedApiKey) {
    return null;
  }

  if (!cachedClient || cachedApiKey !== normalizedApiKey) {
    cachedApiKey = normalizedApiKey;
    cachedClient = new OpenAI({
      apiKey: normalizedApiKey
    });
  }

  return cachedClient;
}
