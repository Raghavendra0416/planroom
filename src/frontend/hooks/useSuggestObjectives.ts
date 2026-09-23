'use client';

import { useEffect, useRef, useState } from 'react';
import { aiFail, aiMissingKey, aiOff } from '@/frontend/copy';
import {
  getSuggestionAvailability,
  suggestObjectives,
  type SuggestRequest,
  type SuggestResult,
} from '@/frontend/services/ai';

const OBJECTIVES_LIMIT = 'Objectives must be 1 to 2000 characters.';

type Phase = 'loading' | 'off' | 'missing' | 'open' | 'down';

/**
 * Suggest button state. The preview is local until the plan is saved.
 */
export interface SuggestObjectivesState {
  canSuggest: boolean;
  notice: string | null;
  preview: string[] | null;
  suggest: (input: SuggestRequest) => Promise<SuggestResult<string[]>>;
  dismiss: () => void;
}

/**
 * Writes chosen preview lines into the objectives field without saving the plan.
 * An empty or whitespace field is replaced. Existing text keeps a separating newline.
 * A result over 2000 characters leaves the field unchanged.
 * @param current - Objectives text currently in the form.
 * @param lines - Preview lines to insert, in preview order.
 * @returns The next field value, or the same value plus the objectives field error.
 */
export function applyObjectivePreview(current: string, lines: readonly string[]): { objectives: string; error?: string } {
  const chosen = lines.join('\n');
  let next = chosen;
  if (current.trim() !== '') {
    next = current.endsWith('\n') ? `${current}${chosen}` : `${current}\n${chosen}`;
  }
  if (next.length > 2000) {
    return { objectives: current, error: OBJECTIVES_LIMIT };
  }
  return { objectives: next };
}

/**
 * Loads suggestion availability and keeps the preview until insert or dismiss.
 * @returns The button gate, the status sentence, the preview lines, and the suggest and dismiss actions.
 */
export function useSuggestObjectives(): SuggestObjectivesState {
  const [phase, setPhase] = useState<Phase>('loading');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
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

  async function suggest(input: SuggestRequest): Promise<SuggestResult<string[]>> {
    if (pendingRef.current) {
      return { ok: false, status: 0, error: '', fields: {} };
    }

    pendingRef.current = true;
    setPending(true);
    setFailure(null);
    setPreview(null);

    try {
      const result = await suggestObjectives(input);
      if (!result.ok && Object.keys(result.fields).length === 0) {
        setFailure(result.error.length > 0 ? result.error : aiFail);
      }
      if (result.ok) {
        setPreview(result.data);
      }
      return result;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function dismiss(): void {
    setPreview(null);
  }

  return {
    canSuggest: phase === 'open' && !pending,
    notice: statusNotice(phase, failure),
    preview,
    suggest,
    dismiss,
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
