import { createGoogle } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateObject } from 'ai';
import { suggestHourModel } from '@/backend/models/suggest-hour.model';
import { AiController } from '@/backend/routes/ai/ai.controller';
import { connectMongo, disconnectMongo } from '@/backend/server';
import { createObjectiveSuggester } from '@/backend/services/ai/ai.factory';
import { GeminiSuggester } from '@/backend/services/ai/gemini.suggester';
import type { ObjectiveSuggester, SuggestInput } from '@/backend/services/ai/objective-suggester';
import { OpenAiCompatibleSuggester } from '@/backend/services/ai/openai-compatible.suggester';
import { asSuggestHourCounter, reserveSuggestHour, suggestHourKey, type SuggestHourCounter } from '@/backend/services/ai/suggest-cap';
import { AiProviderError, ConfigurationError, ValidationError } from '@/backend/utils/errors';
import { suggestCapFailure } from '@/backend/utils/map-error';

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => vi.fn((modelId: string) => ({ modelId, provider: 'planroom' }))),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogle: vi.fn(() => vi.fn((modelId: string) => ({ modelId, provider: 'google' }))),
}));

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

const ENV_KEYS = ['AI_API_KEY', 'AI_BASE_URL'] as const;
const DRAFT_FAILURE = 'Could not draft objectives. Write them yourself.';
const LINES = ['Identify fractions.', 'Explain halves.', 'Compare parts.'];
const PROMPT = [
  'Write 3 to 5 lesson objectives for a school class.',
  'Subject: Maths. Grade: 6. Topic: Fractions.',
  'Each line starts with a verb (identify, explain, calculate, compare).',
  'No preamble, no numbering words like Objective 1.',
].join('\n');

const sample: SuggestInput = {
  topic: 'Fractions',
  subject: 'Maths',
  grade: 6,
  durationMinutes: 40,
};

function setEnv(name: (typeof ENV_KEYS)[number], value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
  } else {
    env[name] = value;
  }
}

function providerConfig(provider: string, timeoutMs = 15000) {
  return {
    ai: {
      provider,
      model: provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini',
      timeoutMs,
    },
  };
}

function hourCounter(): SuggestHourCounter & { findOneAndUpdate: ReturnType<typeof vi.fn> } {
  let count = 0;
  return {
    findOneAndUpdate: vi.fn(async () => {
      count += 1;
      return { count };
    }),
  };
}

function fakeSuggester(): ObjectiveSuggester & { suggest: ReturnType<typeof vi.fn> } {
  return {
    suggest: vi.fn(async () => LINES),
  };
}

function controllerFor(
  counter: SuggestHourCounter,
  suggester: ObjectiveSuggester,
  enabled = true,
): AiController {
  return new AiController(
    {
      ai: { enabled, provider: 'openai-compatible', model: 'gpt-4o-mini', timeoutMs: 15000 },
      security: { maxSuggestPerHour: 10 },
    },
    counter,
    suggester,
  );
}

describe('createObjectiveSuggester', () => {
  let previous: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeEach(() => {
    previous = {};
    for (const key of ENV_KEYS) {
      previous[key] = process.env[key];
      setEnv(key, undefined);
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      setEnv(key, previous[key]);
    }
  });

  it('returns OpenAiCompatibleSuggester for openai-compatible', () => {
    expect(createObjectiveSuggester(providerConfig('openai-compatible'))).toBeInstanceOf(OpenAiCompatibleSuggester);
  });

  it('returns GeminiSuggester for gemini', () => {
    expect(createObjectiveSuggester(providerConfig('gemini'))).toBeInstanceOf(GeminiSuggester);
  });

  it('throws ConfigurationError for an unknown provider and does not call a vendor', () => {
    expect(() => createObjectiveSuggester(providerConfig('anthropic'))).toThrow(ConfigurationError);
    expect(createOpenAICompatible).not.toHaveBeenCalled();
    expect(createGoogle).not.toHaveBeenCalled();
  });

  it('throws ConfigurationError for an empty-string provider and does not call a vendor', () => {
    expect(() => createObjectiveSuggester(providerConfig(''))).toThrow(ConfigurationError);
    expect(createOpenAICompatible).not.toHaveBeenCalled();
    expect(createGoogle).not.toHaveBeenCalled();
  });

  it('drafts with the duration-free prompt, a 15000ms timeout, and the openai-compatible client with structured outputs for gpt-4o-mini', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    setEnv('AI_API_KEY', 'test-key');
    setEnv('AI_BASE_URL', 'http://127.0.0.1:11434/v1');
    vi.mocked(generateObject).mockResolvedValueOnce({ object: { objectives: LINES } } as never);

    try {
      const lines = await createObjectiveSuggester(providerConfig('openai-compatible')).suggest(sample);

      expect(lines).toEqual(LINES);
      expect(createOpenAICompatible).toHaveBeenCalledWith({
        name: 'planroom',
        baseURL: 'http://127.0.0.1:11434/v1',
        apiKey: 'test-key',
        supportsStructuredOutputs: true,
      });
      expect(createGoogle).not.toHaveBeenCalled();
      expect(timeout).toHaveBeenCalledWith(15000);
      const call = vi.mocked(generateObject).mock.calls[0]?.[0] as {
        prompt?: string;
        maxRetries?: number;
        schema?: { safeParse: (value: unknown) => { success: boolean } };
      };
      expect(call.prompt).toBe(PROMPT);
      expect(call.prompt).not.toMatch(/duration/i);
      expect(call.prompt).not.toContain('40');
      expect(call.maxRetries).toBe(0);
      expect(call.schema?.safeParse({ objectives: LINES }).success).toBe(true);
      expect(call.schema?.safeParse({ objectives: ['Only one.', 'Only two.'] }).success).toBe(false);
      expect(call.schema?.safeParse({ objectives: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false);
    } finally {
      timeout.mockRestore();
    }
  });

  it('drafts in no-schema JSON mode for deepseek models to avoid responseFormat warnings and 400 rejections', async () => {
    setEnv('AI_API_KEY', 'test-key');
    setEnv('AI_BASE_URL', 'https://api.deepseek.com/v1');
    vi.mocked(generateObject).mockResolvedValueOnce({ object: { objectives: LINES } } as never);

    const config = {
      ai: {
        provider: 'openai-compatible',
        model: 'deepseek/deepseek-v4-flash-fast',
        timeoutMs: 15000,
      },
    };

    const lines = await createObjectiveSuggester(config).suggest(sample);

    expect(lines).toEqual(LINES);
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: 'planroom',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'test-key',
      supportsStructuredOutputs: false,
    });
    const call = vi.mocked(generateObject).mock.calls[0]?.[0] as {
      output?: string;
      prompt?: string;
      schema?: unknown;
    };
    expect(call.output).toBe('no-schema');
    expect(call.schema).toBeUndefined();
    expect(call.prompt).toContain(PROMPT);
    expect(call.prompt).toContain('JSON');
  });

  it('falls back to no-schema mode when structured outputs request returns HTTP 400 schema rejection', async () => {
    setEnv('AI_API_KEY', 'test-key');
    setEnv('AI_BASE_URL', 'http://127.0.0.1:11434/v1');
    const rejection = Object.assign(new Error('json_schema is not supported'), { statusCode: 400 });
    vi.mocked(generateObject)
      .mockRejectedValueOnce(rejection)
      .mockResolvedValueOnce({ object: { objectives: LINES } } as never);

    const lines = await createObjectiveSuggester(providerConfig('openai-compatible')).suggest(sample);

    expect(lines).toEqual(LINES);
    expect(generateObject).toHaveBeenCalledTimes(2);
    const fallbackCall = vi.mocked(generateObject).mock.calls[1]?.[0] as {
      output?: string;
    };
    expect(fallbackCall.output).toBe('no-schema');
  });

  it('calls createGoogle with the key and passes baseURL only when it is set', async () => {
    setEnv('AI_API_KEY', 'gemini-key');
    vi.mocked(generateObject).mockResolvedValue({ object: { objectives: LINES } } as never);
    const suggester = createObjectiveSuggester(providerConfig('gemini'));

    await suggester.suggest(sample);
    expect(createGoogle).toHaveBeenCalledWith({ apiKey: 'gemini-key' });
    expect(createOpenAICompatible).not.toHaveBeenCalled();

    setEnv('AI_BASE_URL', 'https://example.test/gemini');
    await suggester.suggest(sample);
    expect(createGoogle).toHaveBeenLastCalledWith({
      apiKey: 'gemini-key',
      baseURL: 'https://example.test/gemini',
    });
  });

  it('turns transport, timeout, and HTTP 4xx into AiProviderError', async () => {
    setEnv('AI_API_KEY', 'test-key');
    setEnv('AI_BASE_URL', 'http://127.0.0.1:11434/v1');
    const suggester = createObjectiveSuggester(providerConfig('openai-compatible'));
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const failures = [
      timeout,
      Object.assign(new Error('bad request'), { statusCode: 400 }),
      new TypeError('fetch failed'),
    ];

    for (const failure of failures) {
      vi.mocked(generateObject).mockRejectedValueOnce(failure);
      const error = await suggester.suggest(sample).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(AiProviderError);
      expect(error).toMatchObject({ message: DRAFT_FAILURE });
    }
  });

  it('rejects an object that is not 3 to 5 strings', async () => {
    setEnv('AI_API_KEY', 'test-key');
    setEnv('AI_BASE_URL', 'http://127.0.0.1:11434/v1');
    vi.mocked(generateObject).mockResolvedValueOnce({ object: { objectives: ['Only one.', 'Only two.'] } } as never);

    const error = await createObjectiveSuggester(providerConfig('openai-compatible'))
      .suggest(sample)
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).toMatchObject({ message: DRAFT_FAILURE });
  });
});

describe('suggest cap', () => {
  const body = { topic: 'Fractions', subject: 'MATHS', grade: 6, durationMinutes: 40 };
  const now = new Date(2026, 8, 23, 9, 30);
  let previousKey: string | undefined;

  beforeEach(() => {
    previousKey = process.env.AI_API_KEY;
    setEnv('AI_API_KEY', 'test-key');
  });

  afterEach(() => {
    setEnv('AI_API_KEY', previousKey);
  });

  it('uses the server-local hour key YYYY-MM-DDTHH', () => {
    expect(suggestHourKey(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02T03');
    expect(suggestHourKey(now)).toBe('2026-09-23T09');
  });

  it('does not invoke the suggester on the 11th increment', async () => {
    const order: string[] = [];
    let count = 0;
    const counter: SuggestHourCounter = {
      findOneAndUpdate: vi.fn(async () => {
        order.push('increment');
        count += 1;
        return { count };
      }),
    };
    const suggester: ObjectiveSuggester = {
      suggest: vi.fn(async () => {
        order.push('suggest');
        return LINES;
      }),
    };
    const controller = controllerFor(counter, suggester);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await controller.suggest(body, now);
      expect(result).toEqual({ status: 200, body: { ok: true, data: { objectives: LINES } } });
    }

    const blocked = await controller.suggest(body, now);

    expect(blocked).toEqual(suggestCapFailure());
    expect(blocked.body).not.toHaveProperty('code');
    expect(blocked.body).not.toHaveProperty('fields');
    expect(suggester.suggest).toHaveBeenCalledTimes(10);
    expect(suggester.suggest).toHaveBeenCalledWith(body);
    expect(counter.findOneAndUpdate).toHaveBeenCalledTimes(11);
    expect(counter.findOneAndUpdate).toHaveBeenCalledWith(
      { hour: '2026-09-23T09' },
      { $inc: { count: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    expect(order.slice(0, 20)).toEqual(Array.from({ length: 10 }, () => ['increment', 'suggest']).flat());
    expect(order.at(-1)).toBe('increment');
  });

  it('does not take a cap slot or call the suggester when the key is missing or blank', async () => {
    const counter = hourCounter();
    const suggester = fakeSuggester();
    const controller = controllerFor(counter, suggester);

    setEnv('AI_API_KEY', undefined);
    const missing = await controller.suggest(body, now);
    setEnv('AI_API_KEY', '   ');
    const blank = await controller.suggest(body, now);

    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect(missing.body).toEqual({
      ok: false,
      error: 'Suggestions will be back soon. You can still save this plan.',
    });
    expect(blank.body).toEqual(missing.body);
    expect(missing.body).not.toHaveProperty('code');
    expect(counter.findOneAndUpdate).not.toHaveBeenCalled();
    expect(suggester.suggest).not.toHaveBeenCalled();
  });

  it('does not take a cap slot when suggestions are switched off', async () => {
    const counter = hourCounter();
    const suggester = fakeSuggester();
    const controller = controllerFor(counter, suggester, false);

    const result = await controller.suggest(body, now);

    expect(result.body).toEqual({
      ok: false,
      error: 'Suggestions are off. You can still save this plan.',
    });
    expect(result.body).not.toHaveProperty('code');
    expect(counter.findOneAndUpdate).not.toHaveBeenCalled();
    expect(suggester.suggest).not.toHaveBeenCalled();
  });

  it('does not take a cap slot when the body is invalid', async () => {
    const counter = hourCounter();
    const suggester = fakeSuggester();
    const controller = controllerFor(counter, suggester);

    const error = await controller.suggest({}, now).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(counter.findOneAndUpdate).not.toHaveBeenCalled();
    expect(suggester.suggest).not.toHaveBeenCalled();
  });

  it('reports enabled and available without incrementing or calling a provider', () => {
    const counter = hourCounter();
    const suggester = fakeSuggester();
    const controller = controllerFor(counter, suggester);

    expect(controller.availability()).toEqual({
      status: 200,
      body: { ok: true, data: { enabled: true, available: true } },
    });

    setEnv('AI_API_KEY', '  ');
    expect(controller.availability().body.data.available).toBe(false);
    expect(controller.availability().body.data.enabled).toBe(true);

    const off = controllerFor(counter, suggester, false);
    setEnv('AI_API_KEY', 'test-key');
    expect(off.availability().body.data).toEqual({ enabled: false, available: true });
    expect(counter.findOneAndUpdate).not.toHaveBeenCalled();
    expect(suggester.suggest).not.toHaveBeenCalled();
  });
});

describe('suggest hour store', () => {
  let memory: MongoMemoryServer | undefined;
  const previousUri = process.env.MONGODB_URI;

  beforeAll(async () => {
    memory = await MongoMemoryServer.create();
    process.env.MONGODB_URI = memory.getUri();
    await connectMongo();
    await suggestHourModel().init();
  }, 180000);

  afterAll(async () => {
    try {
      await disconnectMongo();
    } finally {
      if (memory) {
        await memory.stop();
      }
      if (previousUri === undefined) {
        delete process.env.MONGODB_URI;
      } else {
        process.env.MONGODB_URI = previousUri;
      }
    }
  });

  beforeEach(async () => {
    await suggestHourModel().deleteMany({});
  });

  it('increments the server-local hour document', async () => {
    const now = new Date(2026, 8, 23, 9, 30);
    const counter = asSuggestHourCounter();

    await expect(reserveSuggestHour(counter, 10, now)).resolves.toBe(true);
    await expect(reserveSuggestHour(counter, 10, now)).resolves.toBe(true);

    const stored = await suggestHourModel().findOne({ hour: '2026-09-23T09' }).lean();
    expect(stored?.count).toBe(2);
  });
});
