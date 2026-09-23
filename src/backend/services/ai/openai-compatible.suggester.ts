import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  draftObjectives,
  readAiApiKey,
  readAiBaseUrl,
  type ObjectiveSuggester,
  type SuggestInput,
} from '@/backend/services/ai/objective-suggester';
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
 * Drafts objectives through an OpenAI-compatible chat endpoint.
 */
export class OpenAiCompatibleSuggester implements ObjectiveSuggester {
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
   * Drafts 3 to 5 lesson objectives. The prompt does not mention duration.
   * @param input - Topic, subject, grade, and optional duration kept out of the prompt.
   * @returns Three to five objective lines.
   * @throws {AiProviderError} When the provider cannot be reached, times out, or rejects the call.
   */
  async suggest(input: SuggestInput): Promise<string[]> {
    try {
      const structuredOutputs = resolveStructuredOutputs(this.model, this.supportsStructuredOutputs);
      const provider = createOpenAICompatible({
        name: 'planroom',
        baseURL: readAiBaseUrl() ?? '',
        apiKey: readAiApiKey() ?? '',
        supportsStructuredOutputs: structuredOutputs,
      });
      return await draftObjectives(provider(this.model), input, this.timeoutMs, structuredOutputs);
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }
      throw new AiProviderError('Could not draft objectives. Write them yourself.');
    }
  }
}
