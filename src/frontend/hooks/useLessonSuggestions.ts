'use client';

import { useEffect, useRef, useState } from 'react';
import { activitiesLimit, aiFail, aiMissingKey, aiOff, objectivesLimit, resourcesLimit } from '@/frontend/copy';
import {
  getSuggestionAvailability,
  suggestLesson,
  suggestMore,
  type LessonSuggestions,
  type SuggestCategory,
  type SuggestMoreRequest,
  type SuggestRequest,
  type SuggestResult,
} from '@/frontend/services/ai';

export type SuggestionCategory = SuggestCategory;

type Phase = 'loading' | 'off' | 'missing' | 'open' | 'down';

const LIMITS: Record<SuggestionCategory, { limit: number; message: string }> = {
  objectives: { limit: 2000, message: objectivesLimit },
  activities: { limit: 4000, message: activitiesLimit },
  resources: { limit: 2000, message: resourcesLimit },
};

/**
 * Suggest state. Each category keeps its own block, and every line ever shown
 * is remembered per category so Suggest more never repeats it.
 */
export interface SuggestLessonState {
  canSuggest: boolean;
  suggesting: boolean;
  notice: string | null;
  previews: Record<SuggestionCategory, string[]>;
  morePending: Record<SuggestionCategory, boolean>;
  suggest: (input: SuggestRequest) => Promise<SuggestResult<LessonSuggestions>>;
  suggestMoreFor: (category: SuggestionCategory, input: SuggestRequest) => Promise<SuggestResult<string[]>>;
  consumeCategory: (category: SuggestionCategory) => void;
  dismissAll: () => void;
}

/**
 * Writes chosen preview lines into one lesson field without saving the plan.
 * An empty or whitespace field is replaced. Existing text keeps a separating newline.
 * A result over that field's limit leaves the field unchanged.
 * @param category - Objectives, activities, or resources.
 * @param current - Text currently in that form field.
 * @param lines - Preview lines to insert, in preview order.
 * @returns The next field value, or the same value plus that field's error.
 */
export function applySuggestionPreview(
  category: SuggestionCategory,
  current: string,
  lines: readonly string[],
): { value: string; error?: string } {
  const { limit, message } = LIMITS[category];
  const chosen = lines.join('\n');
  let next = chosen;
  if (current.trim() !== '') {
    next = current.endsWith('\n') ? `${current}${chosen}` : `${current}\n${chosen}`;
  }
  if (next.length > limit) {
    return { value: current, error: message };
  }
  return { value: next };
}

/**
 * Loads suggestion availability and tracks per-category previews plus seen lines.
 * @returns The button gate, per-category previews, more-request state, and actions.
 */
export function useLessonSuggestions(): SuggestLessonState {
  const [phase, setPhase] = useState<Phase>('loading');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<SuggestionCategory, string[]>>({
    objectives: [],
    activities: [],
    resources: [],
  });
  const [morePending, setMorePending] = useState<Record<SuggestionCategory, boolean>>({
    objectives: false,
    activities: false,
    resources: false,
  });
  const seenRef = useRef<Record<SuggestionCategory, string[]>>({ objectives: [], activities: [], resources: [] });
  const pendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void getSuggestionAvailability().then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setPhase('down');
        return;
      }
      if (!result.data.enabled) {
        setPhase('off');
        return;
      }
      if (!result.data.available) {
        setPhase('missing');
        return;
      }
      setPhase('open');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function remember(category: SuggestionCategory, lines: readonly string[]): void {
    seenRef.current[category] = [...seenRef.current[category], ...lines];
  }

  async function suggest(input: SuggestRequest): Promise<SuggestResult<LessonSuggestions>> {
    if (pendingRef.current) {
      return { ok: false, status: 0, error: '', fields: {} };
    }

    pendingRef.current = true;
    setPending(true);
    setFailure(null);
    setPreviews({ objectives: [], activities: [], resources: [] });
    seenRef.current = { objectives: [], activities: [], resources: [] };

    try {
      const result = await suggestLesson(input);
      if (!result.ok && Object.keys(result.fields).length === 0) {
        setFailure(result.error.length > 0 ? result.error : aiFail);
      }
      if (result.ok) {
        setPreviews(result.data);
        remember('objectives', result.data.objectives);
        remember('activities', result.data.activities);
        remember('resources', result.data.resources);
      }
      return result;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function suggestMoreFor(
    category: SuggestionCategory,
    input: SuggestRequest,
  ): Promise<SuggestResult<string[]>> {
    if (morePending[category]) {
      return { ok: false, status: 0, error: '', fields: {} };
    }
    setMorePending((current) => ({ ...current, [category]: true }));
    setFailure(null);
    try {
      const body: SuggestMoreRequest = { ...input, category, exclude: seenRef.current[category] };
      const result = await suggestMore(body);
      if (!result.ok && Object.keys(result.fields).length === 0) {
        setFailure(result.error.length > 0 ? result.error : aiFail);
      }
      if (result.ok) {
        setPreviews((current) => ({ ...current, [category]: result.data }));
        remember(category, result.data);
      }
      return result;
    } finally {
      setMorePending((current) => ({ ...current, [category]: false }));
    }
  }

  function consumeCategory(category: SuggestionCategory): void {
    setPreviews((current) => ({ ...current, [category]: [] }));
  }

  function dismissAll(): void {
    setPreviews({ objectives: [], activities: [], resources: [] });
  }

  return {
    canSuggest: phase === 'open' && !pending,
    suggesting: pending,
    notice: statusNotice(phase, failure),
    previews,
    morePending,
    suggest,
    suggestMoreFor,
    consumeCategory,
    dismissAll,
  };
}

/**
 * Picks the sentence under the button. A provider failure stays on the open phase.
 * @param phase - Availability loaded for this form.
 * @param failure - Sentence from the last suggest call, or null.
 * @returns The sentence to show, or null while availability is loading and nothing has failed.
 */
function statusNotice(phase: Phase, failure: string | null): string | null {
  if (phase === 'off') {
    return aiOff;
  }
  if (phase === 'missing') {
    return aiMissingKey;
  }
  if (phase === 'down') {
    return aiFail;
  }
  return failure;
}
