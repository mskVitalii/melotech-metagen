import { Module } from '@nestjs/common';
import { LLMProvider } from './llm-provider.abstract';
import { OpenAIProvider } from './openai.provider';

@Module({
  providers: [
    OpenAIProvider,
    { provide: LLMProvider, useClass: OpenAIProvider },
  ],
  exports: [LLMProvider],
})
export class LLMModule {}
