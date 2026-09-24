import type { PlanFilterKey, PlanFilters } from '@/frontend/hooks/usePlanFilters';
import { statusOptions, subjectOptions } from '@/frontend/components/plans/labels';
import { SelectField } from '@/frontend/components/ui/select';
import { fieldGrade, fieldSubject, fieldTitle, sortBy, sortCreated, sortUpdated, status } from '@/frontend/copy';

const GRADES = [6, 7, 8, 9, 10, 11, 12] as const;

/**
 * Search and filters for the plan register and the review queue.
 * @param props - Filter props.
 * @param props.filters - Filters already parsed by `usePlanFilters`.
 * @param props.onChange - Writes one raw control value. The hook parses it.
 * @returns The search box and the subject, grade, status, and sort selects.
 */
export function PlanFilterBar({
  filters,
  onChange,
}: {
  filters: PlanFilters;
  onChange: (key: PlanFilterKey, value: string) => void;
}) {
  return (
    <div className="plan-filters">
      <label htmlFor="plan-q">
        {fieldTitle}
        <input id="plan-q" value={filters.q} onChange={(event) => onChange('q', event.target.value)} />
      </label>
      <SelectField
        allowEmpty
        caption={fieldSubject}
        id="filter-subject"
        options={subjectOptions()}
        value={filters.subject}
        onValueChange={(value) => onChange('subject', value)}
      />
      <SelectField
        allowEmpty
        caption={fieldGrade}
        id="filter-grade"
        options={GRADES.map((grade) => ({ value: String(grade), label: String(grade) }))}
        value={filters.grade === '' ? '' : String(filters.grade)}
        onValueChange={(value) => onChange('grade', value)}
      />
      <SelectField
        allowEmpty
        caption={status}
        id="filter-status"
        options={statusOptions()}
        value={filters.status}
        onValueChange={(value) => onChange('status', value)}
      />
      <SelectField
        caption={sortBy}
        id="filter-sort"
        options={[
          { value: 'updatedAt', label: sortUpdated },
          { value: 'createdAt', label: sortCreated },
        ]}
        value={filters.sort}
        onValueChange={(value) => onChange('sort', value)}
      />
    </div>
  );
}
