import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { ZodSchema } from 'zod';
import { LLMProvider } from './llm-provider.abstract.js';

@Injectable()
export class OpenAIProvider extends LLMProvider {
  private readonly openai: OpenAI;

  constructor(private readonly config: ConfigService) {
    super();
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
      timeout: 30_000,
      maxRetries: 2,
    });
  }

  async generateStructured<T>(prompt: string, schema: ZodSchema<T>): Promise<T> {
    const completion = await this.openai.chat.completions.parse({
      model: this.config.get<string>('OPENAI_MODEL', 'gpt-5.4'),
      messages: [{ role: 'user', content: prompt }],
      response_format: zodResponseFormat(schema, 'structured_output'),
    });

    const message = completion.choices[0]?.message;

    if (message?.refusal) {
      throw new BadRequestException(
        `Content policy refusal — revise your prompt: ${message.refusal}`,
      );
    }

    if (!message?.parsed) {
      throw new InternalServerErrorException('LLM returned no parsed output');
    }

    return message.parsed as T;
  }
}
