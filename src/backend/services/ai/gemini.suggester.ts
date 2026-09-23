import { createGoogle } from '@ai-sdk/google';
import {
  draftObjectives,
  readAiApiKey,
  readAiBaseUrl,
  type ObjectiveSuggester,
  type SuggestInput,
} from '@/backend/services/ai/objective-suggester';
import { AiProviderError } from '@/backend/utils/errors';

/**
 * Drafts objectives through the Gemini API.
 */
export class GeminiSuggester implements ObjectiveSuggester {
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
   * Drafts 3 to 5 lesson objectives. The prompt does not mention duration.
   * @param input - Topic, subject, grade, and optional duration kept out of the prompt.
   * @returns Three to five objective lines.
   * @throws {AiProviderError} When the provider cannot be reached, times out, or rejects the call.
   */
  async suggest(input: SuggestInput): Promise<string[]> {
    try {
      const apiKey = readAiApiKey() ?? '';
      const baseURL = readAiBaseUrl();
      const provider = createGoogle(baseURL === null ? { apiKey } : { apiKey, baseURL });
      return await draftObjectives(provider(this.model), input, this.timeoutMs);
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }
      throw new AiProviderError('Could not draft objectives. Write them yourself.');
    }
  }
}
