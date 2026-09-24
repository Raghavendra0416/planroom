import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigurationError } from '@/backend/utils/errors';
import { loadConfig, resetConfigCache } from '@/backend/utils/load-config';

const ENV_KEYS = ['APP_ENV', 'NODE_ENV', 'AI_PROVIDER', 'AI_MODEL'] as const;

type EnvKey = (typeof ENV_KEYS)[number];

function setEnv(name: EnvKey, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
  } else {
    env[name] = value;
  }
}

describe('loadConfig', () => {
  let previous: Partial<Record<EnvKey, string | undefined>>;

  beforeEach(() => {
    previous = {};
    for (const key of ENV_KEYS) {
      previous[key] = process.env[key];
      setEnv(key, undefined);
    }
    resetConfigCache();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      setEnv(key, previous[key]);
    }
    resetConfigCache();
  });

  it('uses the localhost provider and model', () => {
    setEnv('APP_ENV', 'localhost');

    expect(loadConfig().ai.provider).toBe('openai-compatible');
    expect(loadConfig().ai.model).toBe('gpt-4o-mini');
  });

  it('uses the production provider and model', () => {
    setEnv('APP_ENV', 'production');

    const config = loadConfig();

    expect(config.ai.provider).toBe('gemini');
    expect(config.ai.model).toBe('gemini-2.0-flash');
    expect(config.app.url).toBe('https://planroom.site/');
    expect(config.app.name).toBe('Planroom');
    expect(config.auth.sessionDays).toBe(14);
    expect(config.ai.enabled).toBe(true);
    expect(config.ai.timeoutMs).toBe(15000);
  });

  it('selects localhost when APP_ENV is missing', () => {
    setEnv('APP_ENV', undefined);
    setEnv('NODE_ENV', 'production');

    expect(loadConfig().ai).toMatchObject({
      provider: 'openai-compatible',
      model: 'gpt-4o-mini',
    });
    expect(loadConfig().app.url).toBe('http://localhost:3000');
  });

  it('keeps localhost when NODE_ENV is production and APP_ENV is localhost', () => {
    setEnv('NODE_ENV', 'production');
    setEnv('APP_ENV', 'localhost');

    expect(loadConfig().ai.provider).toBe('openai-compatible');
    expect(loadConfig().ai.model).toBe('gpt-4o-mini');
  });

  it('lets a non-empty AI_PROVIDER override localhost', () => {
    setEnv('APP_ENV', 'localhost');
    setEnv('AI_PROVIDER', 'gemini');

    const config = loadConfig();

    expect(config.ai.provider).toBe('gemini');
    expect(config.ai.model).toBe('gpt-4o-mini');
  });

  it('lets a non-empty AI_MODEL override localhost', () => {
    setEnv('APP_ENV', 'localhost');
    setEnv('AI_MODEL', 'custom-model');

    const config = loadConfig();

    expect(config.ai.model).toBe('custom-model');
    expect(config.ai.provider).toBe('openai-compatible');
  });

  it('does not let an empty AI_PROVIDER override localhost', () => {
    setEnv('APP_ENV', 'localhost');
    setEnv('AI_PROVIDER', '');

    expect(loadConfig().ai.provider).toBe('openai-compatible');
  });

  it('does not let an empty AI_MODEL override localhost', () => {
    setEnv('APP_ENV', 'localhost');
    setEnv('AI_MODEL', '');

    expect(loadConfig().ai.model).toBe('gpt-4o-mini');
  });

  it('throws ConfigurationError when AI_PROVIDER is not supported', () => {
    setEnv('APP_ENV', 'localhost');
    setEnv('AI_PROVIDER', 'nope');

    expect(() => loadConfig()).toThrow(ConfigurationError);
  });

  it('exposes the footer name from default config', () => {
    setEnv('APP_ENV', 'localhost');

    expect(loadConfig().footer).toEqual({
      fullName: 'Yellapanthula Pragjna Swaroop Raghavendra',
      githubUrl: 'https://github.com/Raghavendra0416/planroom',
      linkedinUrl: 'https://www.linkedin.com/in/raghavendra012/',
    });
  });

  it('returns the cached config until resetConfigCache', () => {
    setEnv('APP_ENV', 'localhost');
    const first = loadConfig();

    setEnv('APP_ENV', 'production');

    expect(loadConfig()).toBe(first);

    resetConfigCache();

    expect(loadConfig().ai.provider).toBe('gemini');
  });

  it('does not store secrets in the config JSON files', () => {
    const files = ['config/default.json', 'config/localhost.json', 'config/production.json'];

    for (const relativePath of files) {
      const text = readFileSync(path.join(process.cwd(), relativePath), 'utf8');

      expect(text).not.toContain('AI_API_KEY');
      expect(text).not.toContain('mongodb+srv');
      expect(text.toLowerCase()).not.toContain('password');
    }
  });
});
