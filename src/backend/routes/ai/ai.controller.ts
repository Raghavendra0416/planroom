import { createLessonSuggester, type LessonSuggesterConfig } from '@/backend/services/ai/ai.factory';
import {
  readAiApiKey,
  type LessonSuggester,
  type LessonSuggestions,
  type SuggestInput,
  type SuggestMoreInput,
} from '@/backend/services/ai/lesson-suggester';
import { asSuggestHourCounter, reserveSuggestHour, type SuggestHourCounter } from '@/backend/services/ai/suggest-cap';
import { readSuggestInput, readSuggestMoreInput } from '@/backend/validation/suggest';
import { loadConfig } from '@/backend/utils/load-config';
import { suggestCapFailure } from '@/backend/utils/map-error';
import { connectMongo } from '@/backend/server';

const SUGGESTIONS_OFF = 'Suggestions are off. You can still save this plan.';
const SUGGESTIONS_UNAVAILABLE = 'Suggestions will be back soon. You can still save this plan.';

/**
 * Settings the suggest route reads. The provider call uses the same AI block.
 */
export interface SuggestSettings extends LessonSuggesterConfig {
  ai: LessonSuggesterConfig['ai'] & { enabled: boolean };
  security: { maxSuggestPerHour: number };
}

/**
 * Success payload for an AI route. Failures are thrown or returned as an error envelope.
 */
export interface AiSuccess<T> {
  status: number;
  body: { ok: true; data: T };
}

type AiFailure = {
  status: number;
  body: { ok: false; error: string };
};

/**
 * Suggest HTTP actions: report whether the button is available, and draft a preview.
 */
export class AiController {
  /**
   * @param settings - `ai.enabled`, the provider, and `security.maxSuggestPerHour`.
   * @param hours - Shared hour counter. A missing key never reaches it.
   * @param suggester - Provider adapter. It is not called when the cap is full.
   */
  constructor(
    private readonly settings: SuggestSettings,
    private readonly hours: SuggestHourCounter,
    private readonly suggester: LessonSuggester,
  ) {}

  /**
   * Reports whether lesson suggestions can be requested. Does not increment the cap or call a provider.
   * @returns `enabled` from configuration and `available` when `AI_API_KEY` is non-blank.
   */
  availability(): AiSuccess<{ enabled: boolean; available: boolean }> {
    return {
      status: 200,
      body: {
        ok: true,
        data: {
          enabled: this.settings.ai.enabled,
          available: readAiApiKey() !== null,
        },
      },
    };
  }

  /**
   * Drafts 3 objectives, 3 activities, and 3 resources. Does not write a plan or change its status.
   * @param body - Untrusted JSON with topic, subject, grade, and optional duration.
   * @param now - Clock used for the server-local hour key. Defaults to the current time.
   * @returns The aligned suggestion lists, or the hour-cap failure when this request is past the cap.
   * @throws {ValidationError} When topic, subject, or grade does not fit. That does not take a cap slot.
   * @throws {AiProviderError} When the provider cannot be reached, times out, or rejects the call.
   */
  async suggest(body: unknown, now = new Date()): Promise<AiSuccess<LessonSuggestions> | AiFailure> {
    // 1. Suggestions that never leave the form do not take a cap slot.
    const gate = await this.passGates(body, readSuggestInput, now);
    if (gate !== null) {
      return gate;
    }

    // 2. Draft the preview. Saving the plan is a separate request.
    return ok(await this.suggester.suggest(passedInput(readSuggestInput(body))));
  }

  /**
   * Drafts 3 more lines for one category, excluding lines already seen. Does not write the plan.
   * @param body - Untrusted JSON with class context, the category, and excluded lines.
   * @param now - Clock used for the server-local hour key. Defaults to the current time.
   * @returns The 3 novel lines under `suggestions`, or the hour-cap failure when past the cap.
   * @throws {ValidationError} When a field does not fit. That does not take a cap slot.
   * @throws {AiProviderError} When the provider cannot be reached, times out, rejects the call, or repeats a line.
   */
  async suggestMore(body: unknown, now = new Date()): Promise<AiSuccess<{ suggestions: string[] }> | AiFailure> {
    // 1. Suggestions that never leave the form do not take a cap slot.
    const gate = await this.passGates(body, readSuggestMoreInput, now);
    if (gate !== null) {
      return gate;
    }

    // 2. Draft the follow-up. Saving the plan is a separate request.
    const input = readSuggestMoreInput(body);
    const suggestions = await this.suggester.suggestMore(passedMoreInput(input));
    return { status: 200, body: { ok: true as const, data: { suggestions } } };
  }

  /**
   * Runs the enabled, key, validation, and cap gates without calling a provider.
   * @param body - Untrusted JSON body.
   * @param read - Validates the body for this endpoint.
   * @param now - Clock used for the server-local hour key.
   * @returns Null when the provider may be called, else the failure envelope.
   */
  private async passGates(body: unknown, read: (body: unknown) => unknown, now: Date): Promise<AiFailure | null> {
    if (!this.settings.ai.enabled) {
      return denied(SUGGESTIONS_OFF);
    }
    if (readAiApiKey() === null) {
      return denied(SUGGESTIONS_UNAVAILABLE);
    }

    // Invalid input does not take a cap slot and does not call the provider.
    read(body);

    // Increment first. The 11th request in this hour does not call the provider.
    const allowed = await reserveSuggestHour(this.hours, this.settings.security.maxSuggestPerHour, now);
    if (!allowed) {
      return suggestCapFailure();
    }
    return null;
  }
}

/**
 * Builds a controller around the shared config, hour counter, and suggester.
 * @returns An AI controller that does not import Next or React.
 */
export async function createAiController(): Promise<AiController> {
  await connectMongo();
  const config = loadConfig();
  return new AiController(config, asSuggestHourCounter(), createLessonSuggester(config));
}

/**
 * Wraps aligned suggestion lists in the success envelope.
 * @param suggestions - Lists the form may insert. Nothing is saved yet.
 * @returns Status 200 and the complete suggestion object.
 */
function ok(suggestions: LessonSuggestions): AiSuccess<LessonSuggestions> {
  return { status: 200, body: { ok: true, data: suggestions } };
}

/**
 * Builds an error envelope with a sentence and no `code` field.
 * @param error - Client-facing sentence.
 * @returns Status 503 and `{ ok: false, error }`.
 */
function denied(error: string): AiFailure {
  return { status: 503, body: { ok: false, error } };
}

/**
 * Copies the suggest fields so an omitted duration is not sent as `undefined`.
 * @param input - Parsed suggest body.
 * @returns The same fields the suggester accepts.
 */
function passedInput(input: SuggestInput): SuggestInput {
  const next: SuggestInput = { topic: input.topic, subject: input.subject, grade: input.grade };
  if (input.durationMinutes !== undefined) {
    next.durationMinutes = input.durationMinutes;
  }
  return next;
}

/**
 * Copies the suggest-more fields so an omitted duration is not sent as `undefined`.
 * @param input - Parsed suggest-more body.
 * @returns The same fields the suggester accepts.
 */
function passedMoreInput(input: SuggestMoreInput): SuggestMoreInput {
  const next: SuggestMoreInput = {
    topic: input.topic,
    subject: input.subject,
    grade: input.grade,
    category: input.category,
    exclude: input.exclude,
  };
  if (input.durationMinutes !== undefined) {
    next.durationMinutes = input.durationMinutes;
  }
  return next;
}
