import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';
import { AiProviderError } from '@/backend/utils/errors';

const DRAFT_FAILURE = 'Could not draft the lesson plan. Write it yourself.';
const DEFAULT_TIMEOUT_MS = 15000;

const lessonSuggestionsSchema = z.object({
  objectives: z.array(z.string().trim().min(1)).length(3),
  activities: z.array(z.string().trim().min(1)).length(3),
  resources: z.array(z.string().trim().min(1)).length(3),
});

const moreSuggestionsSchema = z.object({
  suggestions: z.array(z.string().trim().min(1)).length(3),
});

export type LessonCategory = 'objectives' | 'activities' | 'resources';

/**
 * Fields sent to a suggester. `durationMinutes` is accepted and shapes the prompt.
 */
export interface SuggestInput {
  topic: string;
  subject: string;
  grade: number;
  durationMinutes?: number;
}

/**
 * Fields for one more batch in a single category. `exclude` holds every line
 * already shown, inserted, or dismissed so the model does not repeat them.
 */
export interface SuggestMoreInput extends SuggestInput {
  category: LessonCategory;
  exclude: string[];
}

/**
 * Aligned lesson suggestions. Every category comes from one provider call.
 */
export interface LessonSuggestions {
  objectives: string[];
  activities: string[];
  resources: string[];
}

const CATEGORY_RULES: Record<LessonCategory, { label: string; rule: string }> = {
  objectives: {
    label: 'objectives',
    rule: 'Objectives: measurable outcomes. Each starts with a verb (identify, explain, calculate, compare).',
  },
  activities: {
    label: 'activities',
    rule: 'Activities: sequenced learner-centered steps that teach the topic and fit the duration.',
  },
  resources: {
    label: 'resources',
    rule: 'Resources: practical materials needed for the activities.',
  },
};

/**
 * Drafts lesson suggestions without writing a plan or changing its status.
 */
export interface LessonSuggester {
  /**
   * Drafts objectives, activities, and resources in one provider call.
   * @param input - Topic, subject, grade, and optional duration used in the prompt.
   * @returns Three aligned lists of exactly 3 lines each.
   * @throws {AiProviderError} When the provider cannot be reached, times out, or rejects the call.
   */
  suggest(input: SuggestInput): Promise<LessonSuggestions>;
  /**
   * Drafts 3 more lines for one category, excluding everything already seen.
   * @param input - Class context, the category, and lines to avoid repeating.
   * @returns Three novel lines for that category.
   * @throws {AiProviderError} When the provider cannot be reached, times out, rejects the call, or repeats an excluded line.
   */
  suggestMore(input: SuggestMoreInput): Promise<string[]>;
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
 * Asks a model once for objectives, activities, and resources and hides vendor failures.
 * @param model - Provider model already configured with the key and base URL.
 * @param input - Topic, subject, grade, and optional duration included in the prompt.
 * @param timeoutMs - Abort the call after this many milliseconds. Omitted uses 15000.
 * @param supportsStructuredOutputs - Whether the provider uses OpenAI json_schema structured outputs.
 * @returns The aligned suggestion lists from the model.
 * @throws {AiProviderError} When transport, timeout, or an HTTP error stops the draft.
 */
export async function draftLessonSuggestions(
  model: LanguageModel,
  input: SuggestInput,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  supportsStructuredOutputs = true,
): Promise<LessonSuggestions> {
  try {
    if (supportsStructuredOutputs) {
      const result = await generateObject({
        model,
        schema: lessonSuggestionsSchema,
        prompt: lessonPrompt(input),
        abortSignal: AbortSignal.timeout(timeoutMs),
        maxRetries: 0,
      });
      return checkedSuggestions(result.object.objectives, result.object.activities, result.object.resources);
    }
    const result = await generateObject({
      model,
      output: 'no-schema',
      prompt: lessonJsonPrompt(input),
      abortSignal: AbortSignal.timeout(timeoutMs),
      maxRetries: 0,
    });
    const parsed = lessonSuggestionsSchema.safeParse(result.object);
    if (!parsed.success) {
      throw new AiProviderError(DRAFT_FAILURE);
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof AiProviderError) {
      throw error;
    }
    throw new AiProviderError(DRAFT_FAILURE);
  }
}

/**
 * Asks a model once for 3 more lines in one category and rejects repeats.
 * @param model - Provider model already configured with the key and base URL.
 * @param input - Class context, the category, and lines to avoid repeating.
 * @param timeoutMs - Abort the call after this many milliseconds. Omitted uses 15000.
 * @param supportsStructuredOutputs - Whether the provider uses OpenAI json_schema structured outputs.
 * @returns Three novel lines for that category.
 * @throws {AiProviderError} When transport, timeout, an HTTP error, or a repeated line stops the draft.
 */
export async function draftLessonMore(
  model: LanguageModel,
  input: SuggestMoreInput,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  supportsStructuredOutputs = true,
): Promise<string[]> {
  try {
    if (supportsStructuredOutputs) {
      const result = await generateObject({
        model,
        schema: moreSuggestionsSchema,
        prompt: morePrompt(input),
        abortSignal: AbortSignal.timeout(timeoutMs),
        maxRetries: 0,
      });
      return checkedNovel(result.object.suggestions, input.exclude);
    }
    const result = await generateObject({
      model,
      output: 'no-schema',
      prompt: moreJsonPrompt(input),
      abortSignal: AbortSignal.timeout(timeoutMs),
      maxRetries: 0,
    });
    const parsed = moreSuggestionsSchema.safeParse(result.object);
    if (!parsed.success) {
      throw new AiProviderError(DRAFT_FAILURE);
    }
    return checkedNovel(parsed.data.suggestions, input.exclude);
  } catch (error) {
    if (error instanceof AiProviderError) {
      throw error;
    }
    throw new AiProviderError(DRAFT_FAILURE);
  }
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
 * Builds the class context shared by both prompts. Duration is included when sent.
 * @param input - Subject, grade, topic, and optional duration chosen by the caller.
 * @returns The context line for the prompt.
 */
function classContext(input: SuggestInput): string {
  return input.durationMinutes === undefined
    ? `Subject: ${input.subject}. Grade: ${input.grade}. Topic: ${input.topic}.`
    : `Subject: ${input.subject}. Grade: ${input.grade}. Topic: ${input.topic}. Duration: ${input.durationMinutes} minutes.`;
}

/**
 * Builds the aligned lesson prompt. Every category asks for exactly 3 lines.
 * @param input - Subject, grade, topic, and optional duration chosen by the caller.
 * @returns The exact prompt sent to the provider.
 */
function lessonPrompt(input: SuggestInput): string {
  return [
    'You are a lesson-planning assistant for school teachers.',
    classContext(input),
    'Draft three aligned parts: objectives, activities, and resources.',
    'Objectives: exactly 3 measurable outcomes. Each starts with a verb (identify, explain, calculate, compare).',
    'Activities: exactly 3 sequenced learner-centered steps that teach those objectives and fit the duration.',
    'Resources: exactly 3 practical materials needed for those activities.',
    'Keep every item to one concise sentence a teacher can paste into a plan.',
    'No preamble, no markdown, no numbering, no category labels inside items.',
  ].join('\n');
}

/**
 * Builds the follow-up prompt for one category. Excluded lines must not return.
 * @param input - Class context, the category, and lines to avoid repeating.
 * @returns The exact prompt sent to the provider.
 */
function morePrompt(input: SuggestMoreInput): string {
  const { label, rule } = CATEGORY_RULES[input.category];
  const lines = [
    'You are a lesson-planning assistant for school teachers.',
    classContext(input),
    `Draft exactly 3 new ${label} for the same class.`,
    rule,
    'They must differ from anything already shown or written. Do not repeat an excluded line, even reworded.',
  ];
  if (input.exclude.length > 0) {
    lines.push(`Avoid: ${input.exclude.join(' | ')}`);
  }
  lines.push(
    'Keep every item to one concise sentence a teacher can paste into a plan.',
    'No preamble, no markdown, no numbering, no category labels inside items.',
  );
  return lines.join('\n');
}

/**
 * Accepts only aligned suggestion lists of exactly 3 lines per category.
 * @param objectives - Candidate objectives payload.
 * @param activities - Candidate activities payload.
 * @param resources - Candidate resources payload.
 * @returns The three lists when every category fits.
 * @throws {AiProviderError} When any category is missing, blank, or not exactly 3 lines.
 */
function checkedSuggestions(objectives: unknown, activities: unknown, resources: unknown): LessonSuggestions {
  const parsed = lessonSuggestionsSchema.safeParse({ objectives, activities, resources });
  if (!parsed.success) {
    throw new AiProviderError(DRAFT_FAILURE);
  }
  return parsed.data;
}

/**
 * Accepts only 3 lines that repeat nothing excluded.
 * @param candidates - Candidate follow-up lines.
 * @param exclude - Lines already shown, inserted, or dismissed.
 * @returns The three novel lines.
 * @throws {AiProviderError} When the count is wrong or any line repeats the excluded set.
 */
function checkedNovel(candidates: unknown, exclude: readonly string[]): string[] {
  const parsed = moreSuggestionsSchema.safeParse({ suggestions: candidates });
  if (!parsed.success) {
    throw new AiProviderError(DRAFT_FAILURE);
  }
  const seen = new Set(exclude.map((line) => line.trim().toLowerCase()));
  if (parsed.data.suggestions.some((line) => seen.has(line.trim().toLowerCase()))) {
    throw new AiProviderError(DRAFT_FAILURE);
  }
  return parsed.data.suggestions;
}

/**
 * Builds the prompt with explicit JSON instructions for models running in JSON object mode without schema enforcement.
 * @param input - Subject, grade, topic, and optional duration.
 * @returns The prompt including JSON shape guidance.
 */
function lessonJsonPrompt(input: SuggestInput): string {
  return [
    lessonPrompt(input),
    'Respond with a valid JSON object matching: {"objectives": ["objective 1", "objective 2", "objective 3"], "activities": ["activity 1", "activity 2", "activity 3"], "resources": ["resource 1", "resource 2", "resource 3"]}',
  ].join('\n');
}

/**
 * Builds the follow-up JSON prompt for models running without schema enforcement.
 * @param input - Class context, the category, and lines to avoid repeating.
 * @returns The prompt including JSON shape guidance.
 */
function moreJsonPrompt(input: SuggestMoreInput): string {
  return [
    morePrompt(input),
    'Respond with a valid JSON object matching: {"suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]}',
  ].join('\n');
}
