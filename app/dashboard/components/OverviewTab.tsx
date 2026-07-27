import { useEffect, useState } from 'react';
import { FileText, Users, GitBranch, Code } from 'lucide-react';

type OpenSourceStatusChangeItem = {
  id: number;
  entryId: number;
  cardLabel: string;
  fromStatus: string;
  toStatus: string;
  fromStatusLabel: string;
  toStatusLabel: string;
  createdAt: string;
};

type OverviewTabProps = {
  openSourceCriteria: {
    completedCriteria: number;
    totalCriteria: number;
  };
  leetCodeStats: {
    solved: number;
    easy: number;
    medium: number;
    hard: number;
    username: string | null;
    hasUsername: boolean;
    unavailable: boolean;
  };
  applicationsMetrics: {
    count: number;
    goal: number;
    percentage: number;
    statusText: string;
    statusTextColor: string;
    statusDotClass: string;
    statusBarClass: string;
  };
  applicationsAllTimeCount: number;
  eventsMetrics: {
    count: number;
    totalCount: number;
    goal: number;
    percentage: number;
    statusText: string;
    statusTextColor: string;
    statusDotClass: string;
    statusBarClass: string;
  };
  eventsAllTimeCount: number;
  handleHabitCardClick: (cardId: string) => void;
  /** When set, show instructor-only Open Source column-move log for this student */
  instructorViewUserId?: string | null;
};

function openSourceCriteriaDotClass(completed: number, total: number): string {
  if (total <= 0) return 'bg-gray-500';
  const pct = (completed / total) * 100;
  if (pct >= 100) return 'bg-purple-500';
  if (completed <= 0) return 'bg-red-500';
  if (completed === 1) return 'bg-yellow-500';
  return 'bg-green-500';
}

function formatMoveTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function OverviewTab({
  openSourceCriteria,
  leetCodeStats,
  applicationsMetrics,
  applicationsAllTimeCount,
  eventsMetrics,
  eventsAllTimeCount,
  handleHabitCardClick,
  instructorViewUserId,
}: OverviewTabProps) {
  const { completedCriteria, totalCriteria } = openSourceCriteria;
  const osDot = openSourceCriteriaDotClass(completedCriteria, totalCriteria);

  const [statusChanges, setStatusChanges] = useState<OpenSourceStatusChangeItem[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState('');

  useEffect(() => {
    if (!instructorViewUserId) {
      setStatusChanges([]);
      setLogError('');
      return;
    }

    let cancelled = false;
    setLogLoading(true);
    setLogError('');

    fetch(`/api/instructor/opensource-status-changes?userId=${encodeURIComponent(instructorViewUserId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load activity log');
        }
        if (!cancelled) {
          setStatusChanges(data.changes ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLogError(err instanceof Error ? err.message : 'Failed to load activity log');
          setStatusChanges([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [instructorViewUserId]);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div
          onClick={() => handleHabitCardClick('events')}
          className="bg-gray-800 border border-light-steel-blue rounded-lg p-6 hover:border-electric-blue transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Users className="text-electric-blue text-xl" />
              <h4 className="text-white font-semibold">Events</h4>
            </div>
            <div className={`w-3 h-3 ${eventsMetrics.statusDotClass} rounded-full`}></div>
          </div>
          <div className="flex items-end justify-between mb-1">
            <div>
              <div className="text-3xl font-bold text-white">{eventsMetrics.totalCount ?? eventsMetrics.count}</div>
              <div className="text-sm text-gray-400">This month</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-300">{eventsAllTimeCount}</div>
              <div className="text-xs text-gray-500">All Time</div>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm mt-3">
            <span className="text-gray-400">Goal: {eventsMetrics.goal || '—'}</span>
            {eventsMetrics.goal > 0 && (
              <span className={eventsMetrics.statusTextColor}>{eventsMetrics.statusText}</span>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-3">
            <div
              className={`${eventsMetrics.statusBarClass} h-2 rounded-full`}
              style={{ width: `${eventsMetrics.percentage}%` }}
            ></div>
          </div>
        </div>

        <div
          onClick={() => handleHabitCardClick('opensource')}
          className="bg-gray-800 border border-light-steel-blue rounded-lg p-6 hover:border-electric-blue transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <GitBranch className="text-electric-blue text-xl" />
              <h4 className="text-white font-semibold">Open Source</h4>
            </div>
            <div className={`w-3 h-3 ${osDot} rounded-full`}></div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">
              {completedCriteria}/{totalCriteria || 0}
            </div>
            <div className="text-sm text-gray-400 mt-1">Criteria</div>
          </div>
        </div>

        <div
          onClick={() => handleHabitCardClick('applications')}
          className="bg-gray-800 border border-light-steel-blue rounded-lg p-6 hover:border-electric-blue transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <FileText className="text-electric-blue text-xl" />
              <h4 className="text-white font-semibold">Applications</h4>
            </div>
            <div className={`w-3 h-3 ${applicationsMetrics.statusDotClass} rounded-full`}></div>
          </div>
          <div className="flex items-end justify-between mb-1">
            <div>
              <div className="text-3xl font-bold text-white">{applicationsMetrics.count}</div>
              <div className="text-sm text-gray-400">This month</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-300">{applicationsAllTimeCount}</div>
              <div className="text-xs text-gray-500">All Time</div>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm mt-3">
            <span className="text-gray-400">Goal: {applicationsMetrics.goal || '—'}</span>
            {applicationsMetrics.goal > 0 && (
              <span className={applicationsMetrics.statusTextColor}>{applicationsMetrics.statusText}</span>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-3">
            <div
              className={`${applicationsMetrics.statusBarClass} h-2 rounded-full`}
              style={{ width: `${applicationsMetrics.percentage}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-gray-800 border border-light-steel-blue rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Code className="text-electric-blue text-xl" />
              <h4 className="text-white font-semibold">LeetCode</h4>
            </div>
            {leetCodeStats.username && (
              <a
                href={`https://leetcode.com/u/${encodeURIComponent(leetCodeStats.username)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-electric-blue hover:text-blue-300 transition-colors"
              >
                Link to profile
              </a>
            )}
          </div>
          {leetCodeStats.unavailable ? (
            <div className="text-sm text-gray-400">Stats unavailable right now.</div>
          ) : !leetCodeStats.hasUsername ? (
            <div className="text-sm text-gray-400">Add your LeetCode username in Account.</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <span className="text-sm text-gray-400">Solved</span>
                <span className="text-2xl font-bold text-white">{leetCodeStats.solved}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-cyan-300">Easy</span>
                <span className="text-white">{leetCodeStats.easy}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-yellow-300">Medium</span>
                <span className="text-white">{leetCodeStats.medium}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-300">Hard</span>
                <span className="text-white">{leetCodeStats.hard}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {instructorViewUserId && (
        <div className="mt-8 bg-gray-800 border border-light-steel-blue rounded-lg p-6">
          <div className="mb-4">
            <h4 className="text-white font-semibold text-lg">Open Source column moves</h4>
            <p className="text-sm text-gray-400 mt-1">Last 3 months</p>
          </div>

          {logLoading ? (
            <p className="text-sm text-gray-400">Loading activity…</p>
          ) : logError ? (
            <p className="text-sm text-red-300">{logError}</p>
          ) : statusChanges.length === 0 ? (
            <p className="text-sm text-gray-400">No Open Source column moves in the last 3 months</p>
          ) : (
            <ul className="show-scrollbar space-y-3 max-h-80 overflow-y-scroll pr-2">
              {statusChanges.map((change) => (
                <li
                  key={change.id}
                  className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 border-b border-gray-700/80 pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <div className="text-white text-sm font-medium">{change.cardLabel}</div>
                    <div className="text-sm text-gray-300 mt-0.5">
                      <span className="text-gray-400">{change.fromStatusLabel}</span>
                      <span className="mx-2 text-electric-blue">→</span>
                      <span>{change.toStatusLabel}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 shrink-0">{formatMoveTime(change.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
