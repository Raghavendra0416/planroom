'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * List filters taken from the query string.
 * Grade is a number, or `''` when the query is empty. Sort is only `updatedAt` or `createdAt`.
 */
export interface PlanFilters {
  status: string;
  subject: string;
  grade: number | '';
  q: string;
  sort: 'updatedAt' | 'createdAt';
}

/**
 * Options for reading filters. `defaultStatus` applies only when `status` is absent.
 */
export interface PlanFilterOptions {
  defaultStatus?: string;
}

/**
 * Query keys `usePlanFilters` reads and writes.
 */
export type PlanFilterKey = 'status' | 'subject' | 'grade' | 'q' | 'sort';

/**
 * Parsed filters plus the setter that writes one key back to the query string.
 */
export interface PlanFilterState {
  filters: PlanFilters;
  setFilter: (key: PlanFilterKey, value: string) => void;
}

/**
 * Reads `status`, `subject`, `grade`, `q`, and `sort` from a query string.
 * @param params - Current page query. Other keys are ignored.
 * @param options - Status to use when the `status` key is missing. An empty `status=` stays empty.
 * @returns Filters for the list. Unknown and empty sorts are `updatedAt`. Grade is a number or `''`.
 */
export function parsePlanFilters(params: Pick<URLSearchParams, 'get'>, options: PlanFilterOptions = {}): PlanFilters {
  const statusParam = params.get('status');

  return {
    status: statusParam === null ? (options.defaultStatus ?? '') : statusParam,
    subject: params.get('subject') ?? '',
    grade: readGrade(params.get('grade')),
    q: params.get('q') ?? '',
    sort: params.get('sort') === 'createdAt' ? 'createdAt' : 'updatedAt',
  };
}

/**
 * Reports whether filters narrow the list past an optional default status.
 * @param filters - Filters already read by `parsePlanFilters`.
 * @param defaultStatus - Status that does not count as a narrowing filter. Defaults to none.
 * @returns True when a search, subject, grade, or non-default status is set.
 */
export function hasNarrowingFilters(filters: PlanFilters, defaultStatus = ''): boolean {
  if (filters.q !== '' || filters.subject !== '' || filters.grade !== '') {
    return true;
  }
  if (defaultStatus === '') {
    return filters.status !== '';
  }
  return filters.status !== '' && filters.status !== defaultStatus;
}

/**
 * Keeps list filters in the query string. This hook is the only reader of those keys.
 * @param options - Status used when the page has no `status` key, such as the review queue.
 * @returns The parsed filters and a setter that replaces one key without parsing in the caller.
 */
export function usePlanFilters(options: PlanFilterOptions = {}): PlanFilterState {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const defaultStatus = options.defaultStatus;
  const filters = parsePlanFilters(params, { defaultStatus });

  const setFilter = useCallback(
    (key: PlanFilterKey, value: string) => {
      const next = new URLSearchParams(params.toString());
      writeFilter(next, key, value, defaultStatus);
      const query = next.toString();
      router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
    },
    [defaultStatus, params, pathname, router],
  );

  return { filters, setFilter };
}

/**
 * Keeps a grade only as a finite number. An empty query stays empty instead of becoming 0.
 * @param value - Raw `grade` query value, or null when the key is absent.
 * @returns The number, or `''` when the filter should not narrow by grade.
 */
function readGrade(value: string | null): number | '' {
  if (value === null || value === '') {
    return '';
  }

  const grade = Number(value);
  if (!Number.isFinite(grade)) {
    return '';
  }
  return grade;
}

/**
 * Writes one raw filter value. Empty values are removed, except an explicit empty status when a default exists.
 * @param params - Query string being edited.
 * @param key - Filter key to replace.
 * @param value - Raw control value. Grade stays a string here and is parsed on the next read.
 * @param defaultStatus - Status omitted from the URL when it matches, so a missing key can mean that default.
 */
function writeFilter(params: URLSearchParams, key: PlanFilterKey, value: string, defaultStatus: string | undefined): void {
  if (key === 'sort') {
    if (value === 'createdAt') {
      params.set('sort', 'createdAt');
    } else {
      params.delete('sort');
    }
    return;
  }

  if (key === 'status' && value === '' && defaultStatus !== undefined) {
    params.set('status', '');
    return;
  }

  if (value === '' || (key === 'status' && value === defaultStatus)) {
    params.delete(key);
    return;
  }

  params.set(key, value);
}
