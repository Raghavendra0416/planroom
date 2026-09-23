import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';
import { AiProviderError } from '@/backend/utils/errors';

const DRAFT_FAILURE = 'Could not draft objectives. Write them yourself.';
const DEFAULT_TIMEOUT_MS = 15000;

const objectivesSchema = z.object({
  objectives: z.array(z.string()).min(3).max(5),
});

/**
 * Fields sent to a suggester. `durationMinutes` is accepted and is not part of the prompt.
 */
export interface SuggestInput {
  topic: string;
  subject: string;
  grade: number;
  durationMinutes?: number;
}

/**
 * Drafts lesson objectives without writing a plan or changing its status.
 */
export interface ObjectiveSuggester {
  /**
   * Drafts 3 to 5 lesson objectives. The prompt does not mention duration.
   * @param input - Topic, subject, grade, and optional duration kept out of the prompt.
   * @returns Three to five objective lines.
   * @throws {AiProviderError} When the provider cannot be reached, times out, or rejects the call.
   */
  suggest(input: SuggestInput): Promise<string[]>;
}

/**
 * Reads a non-blank `AI_API_KEY`.
 * @returns The trimmed key, or null when the variable is missing or blank.
 */
export function readAiApiKey(): string | null {
  return readEnv('AI_API_KEY');
}

/**
 * Reads a non-blank `AI_BASE_URL`.
 * @returns The trimmed base URL, or null when the variable is missing or blank.
 */
export function readAiBaseUrl(): string | null {
  return readEnv('AI_BASE_URL');
}

/**
 * Asks a model for 3 to 5 objectives and hides vendor failures.
 * @param model - Provider model already configured with the key and base URL.
 * @param input - Topic, subject, and grade. Duration is not included in the prompt.
 * @param timeoutMs - Abort the call after this many milliseconds. Omitted uses 15000.
 * @param supportsStructuredOutputs - Whether the provider uses OpenAI json_schema structured outputs.
 * @returns The objective lines from the model.
 * @throws {AiProviderError} When transport, timeout, or an HTTP 4xx stops the draft.
 */
export async function draftObjectives(
  model: LanguageModel,
  input: SuggestInput,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  supportsStructuredOutputs = true,
): Promise<string[]> {
  // 1. Ask for 3 to 5 objectives. The prompt does not include duration.
  let objectives: unknown;
  try {
    if (supportsStructuredOutputs) {
      const result = await generateObject({
        model,
        schema: objectivesSchema,
        prompt: objectivesPrompt(input),
        abortSignal: AbortSignal.timeout(timeoutMs),
        maxRetries: 0,
      });
      objectives = result.object.objectives;
    } else {
      const result = await generateObject({
        model,
        output: 'no-schema',
        prompt: objectivesJsonPrompt(input),
        abortSignal: AbortSignal.timeout(timeoutMs),
        maxRetries: 0,
      });
      const parsed = objectivesSchema.safeParse(result.object);
      if (!parsed.success) {
        throw new AiProviderError(DRAFT_FAILURE);
      }
      objectives = parsed.data.objectives;
    }
  } catch (error) {
    if (error instanceof AiProviderError) {
      throw error;
    }
    if (supportsStructuredOutputs && isSchemaRejection(error)) {
      try {
        const fallbackResult = await generateObject({
          model,
          output: 'no-schema',
          prompt: objectivesJsonPrompt(input),
          abortSignal: AbortSignal.timeout(timeoutMs),
          maxRetries: 0,
        });
        const parsed = objectivesSchema.safeParse(fallbackResult.object);
        if (parsed.success && isObjectiveList(parsed.data.objectives)) {
          return parsed.data.objectives;
        }
      } catch {
        // Fall through to throw DRAFT_FAILURE
      }
    }
    // 2. Transport, timeout, and HTTP 4xx become one safe provider error.
    throw new AiProviderError(DRAFT_FAILURE);
  }

  if (!isObjectiveList(objectives)) {
    throw new AiProviderError(DRAFT_FAILURE);
  }

  return objectives;
}

/**
 * Reads one trimmed environment value.
 * @param name - `AI_API_KEY` or `AI_BASE_URL`.
 * @returns The trimmed value, or null when it is missing or blank.
 */
function readEnv(name: 'AI_API_KEY' | 'AI_BASE_URL'): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds the lesson-objective prompt. Duration is not included.
 * @param input - Subject, grade, and topic already chosen by the caller.
 * @returns The exact prompt sent to the provider.
 */
function objectivesPrompt(input: Pick<SuggestInput, 'subject' | 'grade' | 'topic'>): string {
  return [
    'Write 3 to 5 lesson objectives for a school class.',
    `Subject: ${input.subject}. Grade: ${input.grade}. Topic: ${input.topic}.`,
    'Each line starts with a verb (identify, explain, calculate, compare).',
    'No preamble, no numbering words like Objective 1.',
  ].join('\n');
}

/**
 * Accepts only 3 to 5 strings.
 * @param value - Model payload, which may not match the schema.
 * @returns True when the value can be shown as a preview.
 */
function isObjectiveList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 3 && value.length <= 5 && value.every((line) => typeof line === 'string');
}

/**
 * Builds the prompt with explicit JSON instructions for models running in JSON object mode without schema enforcement.
 * @param input - Subject, grade, and topic.
 * @returns The prompt including JSON shape guidance.
 */
function objectivesJsonPrompt(input: Pick<SuggestInput, 'subject' | 'grade' | 'topic'>): string {
  return [
    objectivesPrompt(input),
    'Respond with a valid JSON object matching: {"objectives": ["objective 1", "objective 2", "objective 3"]}',
  ].join('\n');
}

/**
 * Checks if an error is a rejection from an LLM API because json_schema or response_format was unsupported.
 * @param error - Caught error.
 * @returns True if error indicates schema rejection.
 */
function isSchemaRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const status =
    'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 'status' in error && typeof error.status === 'number'
        ? error.status
        : 0;

  return (
    status === 400 &&
    (message.includes('schema') ||
      message.includes('response_format') ||
      message.includes('structured') ||
      message.includes('unsupported'))
  );
}
