import { Module } from '@nestjs/common';
import { LLMProvider } from './llm-provider.abstract.js';
import { OpenAIProvider } from './openai.provider.js';

@Module({
  providers: [
    OpenAIProvider,
    { provide: LLMProvider, useClass: OpenAIProvider },
  ],
  exports: [LLMProvider],
})
export class LLMModule {}
