'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/frontend/components/ui/button';
import { dismiss, insert } from '@/frontend/copy';
import type { SuggestionCategory } from '@/frontend/hooks/useLessonSuggestions';

interface SuggestionRow {
  id: string;
  batch: number;
  text: string;
  exiting: boolean;
}

/**
 * One category block: its list plus row and category actions.
 * @param props - Lines, gate, and callbacks.
 * @param props.category - Objectives, activities, or resources.
 * @param props.lines - Current visible lines for this category.
 * @param props.batch - Increments per Suggest more so row ids stay stable.
 * @param props.moreDisabled - True while this category is fetching more.
 * @param props.onInsert - Inserts lines into the field. Returns true only on success.
 * @param props.onSeen - Reports lines already shown, inserted, or dismissed so Suggest more avoids them.
 * @param props.onConsumed - Runs after this category's final row leaves.
 * @param props.insertAllLabel - Category Insert all label.
 * @param props.dismissAllLabel - Category Dismiss all label.
 * @param props.suggestMoreLabel - Category Suggest more label.
 * @param props.onSuggestMore - Fetches 3 more lines for this category.
 * @returns The category list with its actions.
 */
export function CategorySuggestions({
  category,
  lines,
  batch,
  moreDisabled,
  onInsert,
  onSeen,
  onConsumed,
  insertAllLabel,
  dismissAllLabel,
  suggestMoreLabel,
  onSuggestMore,
}: {
  category: SuggestionCategory;
  lines: string[];
  batch: number;
  moreDisabled: boolean;
  onInsert: (category: SuggestionCategory, lines: readonly string[]) => boolean;
  onSeen: (category: SuggestionCategory, lines: readonly string[]) => void;
  onConsumed: () => void;
  insertAllLabel: string;
  dismissAllLabel: string;
  suggestMoreLabel: string;
  onSuggestMore: () => void;
}) {
  const [rows, setRows] = useState<SuggestionRow[]>(() => toRows(category, batch, lines));
  const timers = useRef<number[]>([]);
  const consumed = useRef(false);
  const batchRef = useRef(batch);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    return () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
      timers.current = [];
    };
  }, []);

  useEffect(() => {
    if (batch === batchRef.current) {
      return;
    }
    batchRef.current = batch;
    consumed.current = false;
    if (lines.length > 0) {
      setRows(toRows(category, batch, lines));
    }
  }, [batch, category, lines]);

  useEffect(() => {
    if (consumed.current) {
      return;
    }
    if (batchRef.current === batch && rows.length === 0 && lines.length > 0) {
      consumed.current = true;
      onConsumed();
    }
  }, [rows, lines, batch, onConsumed]);

  function removeRows(ids: ReadonlySet<string>): void {
    setRows((current) => current.filter((row) => !ids.has(row.id)));
    window.requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) {
        return;
      }
      const next = list.querySelector<HTMLElement>('li button:not(:disabled)');
      if (next) {
        next.focus();
        return;
      }
      list.closest('.field-suggestions')?.querySelector<HTMLElement>('.suggestion-actions button:not(:disabled)')?.focus();
    });
  }

  function exitRows(ids: ReadonlySet<string>): void {
    setRows((current) => current.map((row) => (ids.has(row.id) ? { ...row, exiting: true } : row)));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      removeRows(ids);
      return;
    }
    const timer = window.setTimeout(() => removeRows(ids), 220);
    timers.current.push(timer);
  }

  function insertRow(id: string, text: string): void {
    const target = rows.find((row) => row.id === id);
    if (!target || target.exiting) {
      return;
    }
    if (!onInsert(category, [text])) {
      return;
    }
    onSeen(category, [text]);
    exitRows(new Set([id]));
  }

  function dismissRow(id: string, text: string): void {
    const target = rows.find((row) => row.id === id);
    if (!target || target.exiting) {
      return;
    }
    onSeen(category, [text]);
    exitRows(new Set([id]));
  }

  function insertAll(): void {
    const ready = rows.filter((row) => !row.exiting);
    if (ready.length === 0) {
      return;
    }
    if (!onInsert(category, ready.map((row) => row.text))) {
      return;
    }
    onSeen(category, ready.map((row) => row.text));
    exitRows(new Set(ready.map((row) => row.id)));
  }

  function dismissAllRows(): void {
    const ready = rows.filter((row) => !row.exiting);
    if (ready.length === 0) {
      return;
    }
    onSeen(category, ready.map((row) => row.text));
    exitRows(new Set(ready.map((row) => row.id)));
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" className="category-suggestions" data-category={category}>
      <ul className="suggestion-list" ref={listRef}>
        {rows.map((row) => (
          <li
            key={row.id}
            className={row.exiting ? 'suggestion-row is-exiting' : 'suggestion-row'}
            onAnimationEnd={() => {
              if (row.exiting) {
                removeRows(new Set([row.id]));
              }
            }}
          >
            <span>{row.text}</span>
            <span className="suggestion-row-actions">
              <Button
                disabled={row.exiting}
                type="button"
                variant="quiet"
                onClick={() => insertRow(row.id, row.text)}
              >
                {insert}
              </Button>
              <Button
                disabled={row.exiting}
                type="button"
                variant="quiet"
                onClick={() => dismissRow(row.id, row.text)}
              >
                {dismiss}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="suggestion-actions">
        <Button type="button" variant="quiet" onClick={insertAll}>
          {insertAllLabel}
        </Button>
        <Button type="button" variant="quiet" onClick={dismissAllRows}>
          {dismissAllLabel}
        </Button>
        <Button disabled={moreDisabled} type="button" variant="quiet" onClick={onSuggestMore}>
          {suggestMoreLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Converts one batch into stable rows.
 * @param category - The category these rows belong to.
 * @param batch - Suggest-more generation so ids never collide across batches.
 * @param lines - The visible lines.
 * @returns Rows with stable ids.
 */
function toRows(category: SuggestionCategory, batch: number, lines: string[]): SuggestionRow[] {
  return lines.map((text, index) => ({ id: `${category}-${batch}-${index}`, batch, text, exiting: false }));
}
