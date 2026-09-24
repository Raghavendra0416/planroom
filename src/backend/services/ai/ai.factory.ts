import { GeminiSuggester } from '@/backend/services/ai/gemini.suggester';
import type { LessonSuggester } from '@/backend/services/ai/lesson-suggester';
import { OpenAiCompatibleSuggester } from '@/backend/services/ai/openai-compatible.suggester';
import { ConfigurationError } from '@/backend/utils/errors';

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Configuration the factory reads. `ai.provider` selects the suggester class.
 */
export interface LessonSuggesterConfig {
  ai: {
    provider: string;
    model: string;
    timeoutMs?: number;
    supportsStructuredOutputs?: boolean | 'auto';
  };
}

/**
 * Builds the lesson suggester selected by `config.ai.provider`.
 * @param config - Application configuration. Only `openai-compatible` and `gemini` are supported.
 * @returns The suggester for that provider.
 * @throws {ConfigurationError} When `ai.provider` is unknown or an empty string.
 * @example
 * const suggester = createLessonSuggester({
 *   ai: { provider: 'openai-compatible', model: 'gpt-4o-mini', timeoutMs: 15000 },
 * });
 * const suggestions = await suggester.suggest({
 *   topic: 'Fractions',
 *   subject: 'Maths',
 *   grade: 6,
 * });
 */
export function createLessonSuggester(config: LessonSuggesterConfig): LessonSuggester {
  const timeoutMs = config.ai.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = config.ai.model;
  const supportsStructuredOutputs = config.ai.supportsStructuredOutputs;

  if (config.ai.provider === 'openai-compatible') {
    return new OpenAiCompatibleSuggester({ model, timeoutMs, supportsStructuredOutputs });
  }
  if (config.ai.provider === 'gemini') {
    return new GeminiSuggester({ model, timeoutMs });
  }

  throw new ConfigurationError('AI provider must be openai-compatible or gemini.');
}
