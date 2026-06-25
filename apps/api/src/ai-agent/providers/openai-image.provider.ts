import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AiProviderConfigService } from '../services/ai-provider-config.service';
import { IAiImageProvider, AiImageGenerationInput, AiImageGenerationResult } from '../interfaces/ai-image-provider.interface';

@Injectable()
export class OpenAiImageProvider implements IAiImageProvider {
  private readonly logger = new Logger('OpenAiImageProvider');
  readonly providerType = 'openai' as const;

  constructor(private readonly providerConfig: AiProviderConfigService) {}

  private get baseUrl(): string {
    return process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

  async isAvailable(): Promise<boolean> {
    const config = await this.providerConfig.resolveRuntimeConfig(this.providerType);
    return config.apiKeyPresent;
  }

  async generateImage(input: AiImageGenerationInput): Promise<AiImageGenerationResult> {
    // Para imagens comerciais, forçaremos DALL-E 3 independentemente da config global que foca em LLM.
    const config = await this.providerConfig.resolveRuntimeConfig(this.providerType);
    const { apiKey } = config;
    
    if (!apiKey) {
      this.logger.error('OpenAI provider is not configured: API key missing.');
      return {
        data: [],
        error: {
          type: 'unknown',
          message: 'OpenAI API key ausente. Configure no SaaS Admin ou ENV.',
        },
      };
    }

    const body: Record<string, unknown> = {
      model: 'dall-e-3',
      prompt: input.prompt,
      n: input.n ?? 1,
      size: input.size ?? '1024x1024',
      response_format: input.response_format ?? 'b64_json', // Defaults to base64 so we don't have to download it via a separate HTTP request
    };

    try {
      this.logger.log(`Gerando imagem via DALL-E 3 com prompt truncado: ${input.prompt.slice(0, 100)}...`);
      const { data } = await axios.post(
        `${this.baseUrl}/images/generations`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 45_000, // Imagens podem demorar, 45s de timeout
        },
      );

      return {
        data: data.data || [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`OpenAI image generation failed: ${message}`);
      let errorType = 'unknown';

      if (axios.isAxiosError(error) && error.response?.data) {
        this.logger.error(`OpenAI error details: ${JSON.stringify(error.response.data)}`);
        const responseStr = JSON.stringify(error.response.data).toLowerCase();
        if (responseStr.includes('content_policy_violation') || responseStr.includes('safety')) {
          errorType = 'content_policy_violation';
        } else if (responseStr.includes('billing') || responseStr.includes('quota')) {
          errorType = 'quota_exhausted';
        }
      }

      return {
        data: [],
        error: {
          type: errorType,
          message,
        },
      };
    }
  }
}
