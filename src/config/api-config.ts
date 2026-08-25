/**
 * AI 服务商配置。
 *
 * 安全说明：出于安全考虑，这里不内置任何真实 API Key。
 * 密钥由用户在「AI 助手 → 模型接入」界面填写，仅保存于本机 localStorage，
 * 不会进入构建产物，也绝不会上传到任何服务器或代码仓库。
 */
export type ProviderKey = "zhipu" | "ollama" | "openai";

export interface ProviderCfg {
  key: ProviderKey;
  label: string;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  hint: string;
}

export const AI_PROVIDERS: Record<ProviderKey, ProviderCfg> = {
  zhipu: {
    key: "zhipu",
    label: "智谱 AI（GLM-4-Flash）",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    needsKey: true,
    hint: "在 open.bigmodel.cn 控制台创建 API Key 后粘贴到下方，仅存本机。",
  },
  ollama: {
    key: "ollama",
    label: "本地 Ollama",
    baseUrl: "http://localhost:11434",
    model: "qwen2.5:7b",
    needsKey: false,
    hint: "本机运行 `ollama serve` 并 `ollama pull qwen2.5:7b`，完全离线。",
  },
  openai: {
    key: "openai",
    label: "OpenAI 兼容接口",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    needsKey: true,
    hint: "任何 OpenAI 兼容端点（DeepSeek / Moonshot / 本地 llama.cpp 等）。",
  },
};

export const DEFAULT_PROVIDER: ProviderKey = "zhipu";
