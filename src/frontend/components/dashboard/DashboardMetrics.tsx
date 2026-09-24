import Link from 'next/link';
import type { SessionActor } from '@/frontend/contexts/SessionContext';
import { subjectLabel } from '@/frontend/components/plans/labels';
import { RegisterSkeleton } from '@/frontend/components/plans/Skeleton';
import { StatusMark } from '@/frontend/components/plans/StatusMark';
import { Button } from '@/frontend/components/ui/button';
import { MetricCard } from '@/frontend/components/dashboard/MetricCard';
import { useDashboardMetrics } from '@/frontend/hooks/useDashboardMetrics';
import {
  dashboardApprovedWeek,
  dashboardByGrade,
  dashboardBySubject,
  dashboardLead,
  dashboardNeedsReview,
  dashboardRecent,
  dashboardSentBack,
  dashboardTitle,
  dashboardTotal,
  emptyList,
  fieldGrade,
  genericError,
  navQueue,
  navPlans,
  retry,
  statusApproved,
  statusChanges,
  statusDraft,
  statusSubmitted,
} from '@/frontend/copy';

/**
 * Aggregate metric cards computed from the signed-in actor's visible plans.
 * @param props - Dashboard props.
 * @param props.actor - Signed-in teacher or head of department. The server already scopes the list.
 * @returns Status, action, and group cards, a skeleton, or the shared failure sentence.
 */
export function DashboardMetrics({ actor }: { actor: SessionActor }) {
  const { summary, loading, error, retry: onRetry } = useDashboardMetrics();

  if (loading || summary === null) {
    return (
      <div aria-busy="true" className="dashboard">
        <h1>{dashboardTitle}</h1>
        <RegisterSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <h1>{dashboardTitle}</h1>
        <p>{genericError}</p>
        <Button type="button" onClick={onRetry}>
          {retry}
        </Button>
      </div>
    );
  }

  const { counts, groups, activity } = summary;

  return (
    <div className="dashboard">
      <h1>{dashboardTitle}</h1>
      <p className="lead">{dashboardLead}</p>
      {counts.total === 0 ? <p>{emptyList}</p> : null}

      <section aria-label={navPlans}>
        <div className="dashboard-grid">
          <MetricCard href="/plans" label={dashboardTotal} value={counts.total} />
          <MetricCard href="/plans?status=DRAFT" label={statusDraft} value={counts.draft} />
          <MetricCard href="/plans?status=SUBMITTED" label={statusSubmitted} value={counts.submitted} />
          <MetricCard href="/plans?status=CHANGES_REQUESTED" label={statusChanges} value={counts.changesRequested} />
          <MetricCard href="/plans?status=APPROVED" label={statusApproved} value={counts.approved} />
        </div>
      </section>

      <section aria-label={dashboardRecent}>
        <h2>{actor.role === 'HOD' ? navQueue : dashboardRecent}</h2>
        <div className="dashboard-grid">
          {actor.role === 'HOD' ? (
            <MetricCard href="/hod" label={dashboardNeedsReview} value={activity.needsReview} />
          ) : (
            <MetricCard href="/plans?status=CHANGES_REQUESTED" label={dashboardSentBack} value={activity.sentBack} />
          )}
          <MetricCard href="/plans?status=APPROVED" label={dashboardApprovedWeek} value={activity.approvedThisWeek} />
        </div>
        {activity.recent.length > 0 ? (
          <ul className="dashboard-recent">
            {activity.recent.map((entry) => (
              <li key={entry.id}>
                <Link className="dashboard-recent-row" href={`/plans/${entry.id}`}>
                  <span className="register-title">{entry.title}</span>
                  <StatusMark status={entry.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-label={dashboardBySubject}>
        <h2>{dashboardBySubject}</h2>
        <div className="dashboard-grid">
          {groups.bySubject.map((group) => (
            <MetricCard
              key={group.subject}
              href={`/plans?subject=${group.subject}`}
              label={subjectLabel(group.subject)}
              value={group.count}
            />
          ))}
        </div>
      </section>

      <section aria-label={dashboardByGrade}>
        <h2>{dashboardByGrade}</h2>
        <div className="dashboard-grid">
          {groups.byGrade.map((group) => (
            <MetricCard
              key={group.grade}
              href={`/plans?grade=${group.grade}`}
              label={`${fieldGrade} ${group.grade}`}
              value={group.count}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
