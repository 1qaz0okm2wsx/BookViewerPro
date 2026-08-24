/** LLM 客户端：支持本地 Ollama 与 OpenAI 兼容接口（含 DeepSeek/Qwen/本地 llama.cpp 等） */

export interface LlmSettings {
  provider: "ollama" | "openai";
  baseUrl: string;
  model: string;
  apiKey: string;
}

const LS_KEY = "bv.llm.settings";

export const DEFAULT_LLM: LlmSettings = {
  provider: "ollama",
  baseUrl: "http://localhost:11434",
  model: "qwen2.5",
  apiKey: "",
};

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_LLM, ...(JSON.parse(raw) as Partial<LlmSettings>) };
  } catch { /* ignore */ }
  return { ...DEFAULT_LLM };
}

export function saveLlmSettings(s: LlmSettings): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(settings: LlmSettings, messages: ChatMessage[]): Promise<string> {
  const base = settings.baseUrl.replace(/\/+$/, "");
  if (settings.provider === "ollama") {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.model, messages, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama 返回 ${res.status}，请确认服务已启动且模型 ${settings.model} 已拉取`);
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: settings.model, messages, temperature: 0.4 }),
  });
  if (!res.ok) throw new Error(`接口返回 ${res.status}，请检查 Base URL 与 API Key`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

/** 连接测试：返回模型响应摘要 */
export async function testConnection(settings: LlmSettings): Promise<string> {
  const answer = await chat(settings, [
    { role: "user", content: "请用不超过十个字回复：连接成功。" },
  ]);
  return answer.trim().slice(0, 60) || "（空响应）";
}

/** 粗略语种检测：中文字符占比高 → zh */
export function detectLang(text: string): "zh" | "en" {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  return cjk >= latin ? "zh" : "en";
}
