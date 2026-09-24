import { createGoogle } from '@ai-sdk/google';
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
 * Drafts lesson suggestions through the Gemini API.
 */
export class GeminiSuggester implements LessonSuggester {
  private readonly model: string;
  private readonly timeoutMs: number;

  /**
   * @param options - Model id and timeout. The key and base URL are read when suggesting.
   * @param options.model - Gemini model id.
   * @param options.timeoutMs - Abort the call after this many milliseconds. Omitted uses 15000.
   */
  constructor(options: { model: string; timeoutMs?: number }) {
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  /**
   * Drafts objectives, activities, and resources. The prompt includes duration when it was sent.
   * @param input - Topic, subject, grade, and optional duration used in the prompt.
   * @returns The three aligned suggestion lists.
   * @throws {AiProviderError} When the provider cannot be reached, times out, or rejects the call.
   */
  async suggest(input: SuggestInput): Promise<LessonSuggestions> {
    try {
      return await draftLessonSuggestions(this.modelInstance(), input, this.timeoutMs);
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
      return await draftLessonMore(this.modelInstance(), input, this.timeoutMs);
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
    const apiKey = readAiApiKey() ?? '';
    const baseURL = readAiBaseUrl();
    const provider = createGoogle(baseURL === null ? { apiKey } : { apiKey, baseURL });
    return provider(this.model);
  }
}
