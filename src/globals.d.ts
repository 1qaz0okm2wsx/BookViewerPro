declare module "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2" {
  const mod: Record<string, unknown>;
  export = mod;
}

declare module "mammoth" {
  interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  interface MammothInput {
    arrayBuffer: ArrayBuffer;
  }
  const mammoth: {
    convertToHtml(input: MammothInput, options?: Record<string, unknown>): Promise<MammothResult>;
    extractRawText(input: MammothInput): Promise<MammothResult>;
  };
  export default mammoth;
}
