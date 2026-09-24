'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/frontend/components/ui/button';
import {
  dismiss,
  fieldActivities,
  fieldObjectives,
  fieldResources,
  insert,
  insertAllActivities,
  insertAllObjectives,
  insertAllResources,
} from '@/frontend/copy';
import type { SuggestionCategory } from '@/frontend/hooks/useLessonSuggestions';
import type { LessonSuggestions } from '@/frontend/services/ai';

interface SuggestionRow {
  id: string;
  text: string;
  exiting: boolean;
}

type SuggestionRows = Record<SuggestionCategory, SuggestionRow[]>;

const CATEGORIES: Array<{ key: SuggestionCategory; heading: string; insertAll: string }> = [
  { key: 'objectives', heading: fieldObjectives, insertAll: insertAllObjectives },
  { key: 'activities', heading: fieldActivities, insertAll: insertAllActivities },
  { key: 'resources', heading: fieldResources, insertAll: insertAllResources },
];

/**
 * Categorized AI suggestions. Successful inserts and dismissals animate rows away.
 * @param props - Suggestions, insert callback, and empty callback.
 * @param props.suggestions - The aligned lists from one AI call.
 * @param props.onInsert - Inserts lines into one field. Returns true only on success.
 * @param props.onEmpty - Runs once after the final row leaves.
 * @returns Three separate lists with row and category actions.
 */
export function LessonSuggestionPreview({
  suggestions,
  onInsert,
  onEmpty,
}: {
  suggestions: LessonSuggestions;
  onInsert: (category: SuggestionCategory, lines: readonly string[]) => boolean;
  onEmpty: () => void;
}) {
  const [rows, setRows] = useState<SuggestionRows>(() => toRows(suggestions));
  const timers = useRef<number[]>([]);
  const emptied = useRef(false);

  useEffect(() => {
    return () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
      timers.current = [];
    };
  }, []);

  useEffect(() => {
    if (emptied.current) {
      return;
    }
    if (rows.objectives.length === 0 && rows.activities.length === 0 && rows.resources.length === 0) {
      emptied.current = true;
      onEmpty();
    }
  }, [rows, onEmpty]);

  function removeRow(category: SuggestionCategory, id: string): void {
    setRows((current) => ({ ...current, [category]: current[category].filter((row) => row.id !== id) }));
  }

  function exitRow(category: SuggestionCategory, id: string): void {
    setRows((current) => ({
      ...current,
      [category]: current[category].map((row) => (row.id === id ? { ...row, exiting: true } : row)),
    }));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      removeRow(category, id);
      return;
    }
    const timer = window.setTimeout(() => removeRow(category, id), 220);
    timers.current.push(timer);
  }

  function insertRow(category: SuggestionCategory, id: string, text: string): void {
    const target = rows[category].find((row) => row.id === id);
    if (!target || target.exiting) {
      return;
    }
    if (!onInsert(category, [text])) {
      return;
    }
    exitRow(category, id);
  }

  function dismissRow(category: SuggestionCategory, id: string): void {
    const target = rows[category].find((row) => row.id === id);
    if (!target || target.exiting) {
      return;
    }
    exitRow(category, id);
  }

  function insertCategory(category: SuggestionCategory): void {
    const ready = rows[category].filter((row) => !row.exiting);
    if (ready.length === 0) {
      return;
    }
    if (!onInsert(category, ready.map((row) => row.text))) {
      return;
    }
    const leaving = new Set(ready.map((row) => row.id));
    setRows((current) => ({
      ...current,
      [category]: current[category].map((row) =>
        leaving.has(row.id) ? { ...row, exiting: true } : row,
      ),
    }));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRows((current) => ({ ...current, [category]: current[category].filter((row) => !leaving.has(row.id)) }));
      return;
    }
    const timer = window.setTimeout(() => {
      setRows((current) => ({ ...current, [category]: current[category].filter((row) => !leaving.has(row.id)) }));
    }, 220);
    timers.current.push(timer);
  }

  return (
    <div className="lesson-suggestions">
      {CATEGORIES.map(({ key, heading, insertAll }) =>
        rows[key].length > 0 ? (
          <section key={key} className="suggestion-category" data-category={key}>
            <h2>{heading}</h2>
            <ul className="suggestion-list">
              {rows[key].map((row) => (
                <li
                  key={row.id}
                  className={row.exiting ? 'suggestion-row is-exiting' : 'suggestion-row'}
                  onAnimationEnd={() => {
                    if (row.exiting) {
                      removeRow(key, row.id);
                    }
                  }}
                >
                  <span>{row.text}</span>
                  <span className="suggestion-row-actions">
                    <Button
                      disabled={row.exiting}
                      type="button"
                      variant="quiet"
                      onClick={() => insertRow(key, row.id, row.text)}
                    >
                      {insert}
                    </Button>
                    <Button
                      disabled={row.exiting}
                      type="button"
                      variant="quiet"
                      onClick={() => dismissRow(key, row.id)}
                    >
                      {dismiss}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="suggestion-actions">
              <Button type="button" variant="quiet" onClick={() => insertCategory(key)}>
                {insertAll}
              </Button>
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}

/**
 * Converts one AI response into stable rows.
 * @param suggestions - The three suggestion lists.
 * @returns Rows keyed by category with request-local ids.
 */
function toRows(suggestions: LessonSuggestions): SuggestionRows {
  return {
    objectives: suggestions.objectives.map((text, index) => ({ id: `objectives-${index}`, text, exiting: false })),
    activities: suggestions.activities.map((text, index) => ({ id: `activities-${index}`, text, exiting: false })),
    resources: suggestions.resources.map((text, index) => ({ id: `resources-${index}`, text, exiting: false })),
  };
}
