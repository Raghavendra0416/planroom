import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  draftLessonMore,
  draftLessonSuggestions,
  readAiApiKey,
  readAiBaseUrl,
  type LessonSuggester,
  type LessonSuggestions,
  type SuggestInput,
  type SuggestMoreInput,
} from '@/backend/services/ai/lesson-suggester';
import { AiProviderError } from '@/backend/utils/errors';

/**
 * Resolves whether the model should be called using OpenAI structured outputs (json_schema)
 * or standard JSON mode (json_object).
 * @param model - Target model id.
 * @param option - Explicit boolean override or 'auto'.
 * @returns True if structured outputs should be enabled.
 */
export function resolveStructuredOutputs(model: string, option: boolean | 'auto' = 'auto'): boolean {
  if (typeof option === 'boolean') {
    return option;
  }
  const lower = model.toLowerCase();
  if (
    lower.includes('deepseek') ||
    lower.includes('llama') ||
    lower.includes('qwen') ||
    lower.includes('mistral')
  ) {
    return false;
  }
  if (
    lower.startsWith('gpt-4o') ||
    lower.startsWith('gpt-4.5') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3')
  ) {
    return true;
  }
  return false;
}

/**
 * Drafts lesson suggestions through an OpenAI-compatible chat endpoint.
 */
export class OpenAiCompatibleSuggester implements LessonSuggester {
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly supportsStructuredOutputs: boolean | 'auto';

  /**
   * @param options - Model id, timeout, and structured output support.
   * @param options.model - Model id passed to the compatible endpoint.
   * @param options.timeoutMs - Abort the call after this many milliseconds. Omitted uses 15000.
   * @param options.supportsStructuredOutputs - 'auto' or explicit boolean.
   */
  constructor(options: { model: string; timeoutMs?: number; supportsStructuredOutputs?: boolean | 'auto' }) {
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.supportsStructuredOutputs = options.supportsStructuredOutputs ?? 'auto';
  }

  /**
   * Drafts objectives, activities, and resources. The prompt includes duration when it was sent.
   * @param input - Topic, subject, grade, and optional duration used in the prompt.
   * @returns The three aligned suggestion lists.
   * @throws {AiProviderError} When the provider cannot be reached, times out, or rejects the call.
   */
  async suggest(input: SuggestInput): Promise<LessonSuggestions> {
    try {
      return await draftLessonSuggestions(this.modelInstance(), input, this.timeoutMs, this.structured());
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }
      throw new AiProviderError('Could not draft the lesson plan. Write it yourself.');
    }
  }

  /**
   * Drafts 3 more lines for one category without repeating excluded lines.
   * @param input - Class context, the category, and lines to avoid repeating.
   * @returns Three novel lines for that category.
   * @throws {AiProviderError} When the provider cannot be reached, times out, rejects the call, or repeats a line.
   */
  async suggestMore(input: SuggestMoreInput): Promise<string[]> {
    try {
      return await draftLessonMore(this.modelInstance(), input, this.timeoutMs, this.structured());
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }
      throw new AiProviderError('Could not draft the lesson plan. Write it yourself.');
    }
  }

  /**
   * Builds the configured provider model.
   * @returns The model passed to the draft functions.
   */
  private modelInstance(): import('ai').LanguageModel {
    const structuredOutputs = this.structured();
    const provider = createOpenAICompatible({
      name: 'planroom',
      baseURL: readAiBaseUrl() ?? '',
      apiKey: readAiApiKey() ?? '',
      supportsStructuredOutputs: structuredOutputs,
    });
    return provider(this.model);
  }

  /**
   * Resolves structured-output mode for this model.
   * @returns True when json_schema structured outputs should be used.
   */
  private structured(): boolean {
    return resolveStructuredOutputs(this.model, this.supportsStructuredOutputs);
  }
}
