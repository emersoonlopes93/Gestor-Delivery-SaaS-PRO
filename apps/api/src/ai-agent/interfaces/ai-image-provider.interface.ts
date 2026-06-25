export interface AiImageGenerationInput {
  prompt: string;
  n?: number;
  size?: string;
  response_format?: 'url' | 'b64_json';
}

export interface AiImageGenerationResult {
  data: {
    url?: string;
    b64_json?: string;
  }[];
  error?: {
    type: string;
    message: string;
  };
}

export interface IAiImageProvider {
  readonly providerType: 'openai' | 'anthropic' | 'google_ai';
  isAvailable(): Promise<boolean>;
  generateImage(input: AiImageGenerationInput): Promise<AiImageGenerationResult>;
}
