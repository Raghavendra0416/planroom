import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ConfigurationError } from '@/backend/utils/errors';

/**
 * Merged Planroom configuration from JSON files and environment overrides.
 */
export interface AppConfig {
  app: { name: string; url: string };
  db: { name: string };
  auth: { sessionDays: number };
  ai: {
    enabled: boolean;
    provider: 'openai-compatible' | 'gemini';
    model: string;
    timeoutMs: number;
    supportsStructuredOutputs: boolean | 'auto';
  };
  security: { maxSuggestPerHour: number };
  footer: { fullName: string; githubUrl: string; linkedinUrl: string };
}

const appConfigSchema = z.object({
  app: z.object({
    name: z.string(),
    url: z.string(),
  }),
  db: z.object({
    name: z.string(),
  }),
  auth: z.object({
    sessionDays: z.number(),
  }),
  ai: z.object({
    enabled: z.boolean(),
    provider: z.enum(['openai-compatible', 'gemini']),
    model: z.string(),
    timeoutMs: z.number(),
    supportsStructuredOutputs: z.union([z.boolean(), z.literal('auto')]).default('auto'),
  }),
  security: z.object({
    maxSuggestPerHour: z.number(),
  }),
  footer: z.object({
    fullName: z.string(),
    githubUrl: z.string(),
    linkedinUrl: z.string(),
  }),
});

let cached: AppConfig | undefined;

/**
 * Loads and caches the merged application configuration.
 * @returns The cached application configuration.
 * @throws {ConfigurationError} When the environment file is missing or the AI provider is not supported.
 */
export function loadConfig(): AppConfig {
  if (cached) {
    return cached;
  }

  cached = readMergedConfig();
  return cached;
}

/**
 * Clears the cached configuration so the next load reads the environment again.
 */
export function resetConfigCache(): void {
  cached = undefined;
}

/**
 * Reads default.json, overlays the APP_ENV file, then applies AI env overrides.
 * @returns A validated configuration that is not yet cached.
 * @throws {ConfigurationError} When the overlay file, provider, or shape is invalid.
 */
function readMergedConfig(): AppConfig {
  const base = readConfigFile('default');
  const overlay = readConfigFile(selectedEnvName());
  const merged = deepMerge(asRecord(base, 'config/default.json'), asRecord(overlay, 'config overlay'));
  applyAiOverrides(merged);

  const provider = isRecord(merged.ai) ? merged.ai.provider : undefined;
  if (!isProvider(provider)) {
    throw new ConfigurationError('AI provider must be openai-compatible or gemini.');
  }

  const parsed = appConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ConfigurationError('Configuration is invalid.');
  }

  return parsed.data;
}

/**
 * Chooses the overlay file. NODE_ENV is ignored. A missing APP_ENV means localhost.
 * @returns `localhost` or `production`.
 * @throws {ConfigurationError} When APP_ENV names another environment.
 */
function selectedEnvName(): 'localhost' | 'production' {
  const appEnv = process.env.APP_ENV;
  if (appEnv === undefined || appEnv === '') {
    return 'localhost';
  }
  if (appEnv === 'localhost' || appEnv === 'production') {
    return appEnv;
  }
  throw new ConfigurationError('APP_ENV must be localhost or production.');
}

/**
 * Applies non-empty AI_PROVIDER and AI_MODEL values over the merged JSON.
 * @param merged - Default config with the environment overlay already applied.
 */
function applyAiOverrides(merged: Record<string, unknown>): void {
  const ai = isRecord(merged.ai) ? { ...merged.ai } : {};
  const provider = process.env.AI_PROVIDER;
  const model = process.env.AI_MODEL;
  const structuredOutputs = process.env.AI_STRUCTURED_OUTPUTS;

  if (typeof provider === 'string' && provider.length > 0) {
    ai.provider = provider;
  }
  if (typeof model === 'string' && model.length > 0) {
    ai.model = model;
  }
  if (typeof structuredOutputs === 'string' && structuredOutputs.length > 0) {
    const trimmed = structuredOutputs.trim().toLowerCase();
    if (trimmed === 'true') {
      ai.supportsStructuredOutputs = true;
    } else if (trimmed === 'false') {
      ai.supportsStructuredOutputs = false;
    } else if (trimmed === 'auto') {
      ai.supportsStructuredOutputs = 'auto';
    }
  }

  merged.ai = ai;
}

/**
 * Reads one config JSON file from the config directory.
 * @param name - `default`, `localhost`, or `production`.
 * @returns The parsed JSON value.
 * @throws {ConfigurationError} When the file cannot be read or parsed.
 */
function readConfigFile(name: 'default' | 'localhost' | 'production'): unknown {
  const relativePath = `config/${name}.json`;
  const fullPath =
    name === 'default'
      ? path.join(process.cwd(), 'config', 'default.json')
      : name === 'localhost'
        ? path.join(process.cwd(), 'config', 'localhost.json')
        : path.join(process.cwd(), 'config', 'production.json');

  try {
    return JSON.parse(readFileSync(fullPath, 'utf8')) as unknown;
  } catch {
    throw new ConfigurationError(`Could not read ${relativePath}.`);
  }
}

/**
 * Deep-merges plain objects. Overlay values replace leaves and nested objects merge.
 * @param base - The starting record.
 * @param override - Values that win when both sides define a key.
 * @returns A new merged record.
 */
function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    if (isRecord(current) && isRecord(value)) {
      result[key] = deepMerge(current, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Narrows a JSON value to a record or throws when the file is the wrong shape.
 * @param value - Parsed JSON.
 * @param label - File role named in the configuration error.
 * @returns The same value as a record.
 * @throws {ConfigurationError} When the value is not a plain object.
 */
function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ConfigurationError(`${label} must be a JSON object.`);
  }
  return value;
}

/**
 * Reports whether a value is a plain object.
 * @param value - Any JSON or runtime value.
 * @returns True when the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reports whether a value is a supported AI provider id.
 * @param value - Candidate provider from JSON or the environment.
 * @returns True for `openai-compatible` and `gemini`.
 */
function isProvider(value: unknown): value is AppConfig['ai']['provider'] {
  return value === 'openai-compatible' || value === 'gemini';
}
