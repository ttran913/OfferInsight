"use client"

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { ModalOverlay, ModalPanel } from '@/app/dashboard/components/shared';
import { DEFAULT_AVAILABILITY_TIMEZONE } from '@/app/lib/calendar/constants';
import type { StatusColor } from '@/app/lib/student-status';
import FilterDropdown, { type FilterOption } from './FilterDropdown';

interface UserData {
  id: string;
  name: string;
  email: string | null;
  activeStatus: StatusColor;
  progressStatus: StatusColor;
  removedFromResumeBook: boolean;
  inactivityWarningCount: number;
  assignedInstructorId?: string | null;
  effectiveInstructorId?: string | null;
  meeting?: {
    instructorId: string;
    instructorLabel: string;
    timezone: string;
    /** ISO start of the next meeting the student will attend */
    nextStart: string | null;
    /** ISO start of the regular date the next meeting was moved from, one time */
    movedFrom: string | null;
    /** ISO start of the most recent meeting that already ended */
    lastStart?: string | null;
    lastMissed?: boolean;
  } | null;
  missedCount?: number;
  lastMissedStart?: string | null;
  /** On the 72h/96h "book a monthly 1:1" clock */
  mustBook?: {
    reason: 'missedMeeting' | 'skippedOnboarding';
    since: string;
    /** Book-by before the final warning, removal time after it */
    deadline: string;
    finalWarningSent: boolean;
  } | null;
  openSource: {
    issuesCompleted: number;
    partnershipsCompleted?: number;
    completedCount: number;
    totalCount: number;
  };
  applications: {
    lastMonth: number;
    allTime: number;
  };
  coffeeChats: {
    lastMonth: number;
    allTime: number;
  };
  events: {
    lastMonth: number;
    allTime: number;
  };
}

interface AssignableInstructor {
  id: string;
  label: string;
}

interface AssignResult {
  userId: string;
  tone: 'success' | 'warning' | 'error';
  message: string;
}

function formatMeetingDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(iso)
  );
}

function formatMeetingTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

type RemovedState = 'removed' | 'not-removed';

const REMOVED_STATES: { value: RemovedState; label: string; description: string }[] = [
  { value: 'not-removed', label: 'Not removed', description: 'Still in the Resume Book' },
  { value: 'removed', label: 'Removed', description: 'Removed from the Resume Book' },
];

function removedStateOf(user: UserData): RemovedState {
  return user.removedFromResumeBook ? 'removed' : 'not-removed';
}

/** Picking every option filters nothing, so treat it the same as picking none */
function effectiveSelection<T>(selected: T[], optionCount: number): T[] {
  return selected.length >= optionCount ? [] : selected;
}

const STATUS_COLORS: { value: StatusColor; label: string; dotClass: string }[] = [
  { value: 2, label: 'Green', dotClass: 'bg-green-500' },
  { value: 1, label: 'Yellow', dotClass: 'bg-yellow-500' },
  { value: 0, label: 'Red', dotClass: 'bg-red-500' },
];

interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

function selectionChips<T extends string | number>(
  group: string,
  options: FilterOption<T>[],
  selection: T[],
  onChange: (next: T[]) => void
): FilterChip[] {
  return options
    .filter((option) => selection.includes(option.value))
    .map((option) => ({
      key: `${group}-${option.value}`,
      label: `${group}: ${option.label}`,
      onRemove: () => onChange(selection.filter((v) => v !== option.value)),
    }));
}

const ACTIVE_STATUS_DESCRIPTIONS: Record<StatusColor, string> = {
  2: 'Active in the last 7 days',
  1: 'Active in the last 30 days',
  0: 'No activity in the last 30 days',
};

const PROGRESS_STATUS_DESCRIPTIONS: Record<StatusColor, string> = {
  2: '2+ criteria types completed in the last 30 days',
  1: '1+ issue completed in the last 90 days',
  0: 'No recent progress, or no active partnership',
};

const DEBUG_MODE = false;

function generateDebugUsers(): UserData[] {
  const names = [
    'Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Ethan Hunt',
    'Fiona Chen', 'George Williams', 'Hannah Kim', 'Isaac Newton', 'Julia Roberts',
    'Kevin Zhang', 'Laura Martinez', 'Michael Jordan', 'Nancy Drew', 'Oliver Twist',
    'Patricia Lee', 'Quinn Anderson', 'Rachel Green', 'Steve Jobs', 'Tina Turner'
  ];

  return names.map((name, index) => {
    const hasGoodProgress = index % 4 === 0;
    const hasMediumProgress = index % 4 === 1;
    const isActive = index % 3 === 0;
    const isMediumActive = index % 3 === 1;

    const activeStatus = isActive ? 2 : (isMediumActive ? 1 : 0);
    const progressStatus = hasGoodProgress ? 2 : (hasMediumProgress ? 1 : 0);

    const applicationsLastMonth = hasGoodProgress ? Math.floor(Math.random() * 5) + 2 : (hasMediumProgress ? 1 : Math.floor(Math.random() * 2));
    const eventsLastMonth = hasGoodProgress ? Math.floor(Math.random() * 3) + 1 : (hasMediumProgress ? Math.floor(Math.random() * 2) : 0);
    const coffeeChatsLastMonth = hasGoodProgress ? Math.floor(Math.random() * 6) + 4 : (hasMediumProgress ? Math.floor(Math.random() * 5) + 2 : Math.floor(Math.random() * 3));

    const issuesCompleted = Math.floor(Math.random() * 5);
    const partnershipsCompleted = Math.floor(Math.random() * 4);
    const totalCriteria = Math.max(issuesCompleted + Math.floor(Math.random() * 5), 1);

    const removedFromResumeBook = index % 10 === 9;
    const inactivityWarningCount = removedFromResumeBook ? 3 : (index % 8 === 7 ? 2 : (index % 6 === 5 ? 1 : 0));

    return {
      id: `debug-${index}`,
      name: name,
      email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
      activeStatus,
      progressStatus,
      removedFromResumeBook,
      inactivityWarningCount,
      missedCount: index % 7 === 3 ? 1 : 0,
      lastMissedStart: null,
      mustBook: null,
      openSource: {
        issuesCompleted,
        partnershipsCompleted,
        completedCount: issuesCompleted,
        totalCount: totalCriteria,
      },
      applications: {
        lastMonth: applicationsLastMonth,
        allTime: applicationsLastMonth * 5 + Math.floor(Math.random() * 20)
      },
      coffeeChats: {
        lastMonth: coffeeChatsLastMonth,
        allTime: coffeeChatsLastMonth * 4 + Math.floor(Math.random() * 30)
      },
      events: {
        lastMonth: eventsLastMonth,
        allTime: eventsLastMonth * 3 + Math.floor(Math.random() * 15)
      },
    };
  });
}

export default function UsersTab() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [reinstatingUserId, setReinstatingUserId] = useState<string | null>(null);
  const [canMutateUserData, setCanMutateUserData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [minIssuesFilter, setMinIssuesFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<StatusColor[]>([]);
  const [progressFilter, setProgressFilter] = useState<StatusColor[]>([]);
  const [removedFilter, setRemovedFilter] = useState<RemovedState[]>([]);
  const [sortOrder, setSortOrder] = useState<'name-asc' | 'name-desc' | 'issues-high' | 'issues-low'>('name-asc');
  const [instructors, setInstructors] = useState<AssignableInstructor[]>([]);
  const [defaultInstructorId, setDefaultInstructorId] = useState<string | null>(null);
  const [currentInstructorId, setCurrentInstructorId] = useState<string | null>(null);
  const [canAssign, setCanAssign] = useState(false);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [assignResult, setAssignResult] = useState<AssignResult | null>(null);
  const [missedConfirmUser, setMissedConfirmUser] = useState<UserData | null>(null);
  const [missedBusyUserId, setMissedBusyUserId] = useState<string | null>(null);
  const [missedResult, setMissedResult] = useState<AssignResult | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/instructor/students');
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      const data = await response.json();
      setUsers(data.students || []);
      setInstructors(data.instructors || []);
      setDefaultInstructorId(data.defaultInstructorId ?? null);
      setCurrentInstructorId(data.currentInstructorId ?? null);
      setCanAssign(Boolean(data.canAssign));
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (DEBUG_MODE) {
      setUsers(generateDebugUsers());
      setLoading(false);
      return;
    }
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    async function fetchInstructorPermissions() {
      try {
        const response = await fetch('/api/instructor');
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        setCanMutateUserData(Boolean(data?.canEditViewedUser));
      } catch (error) {
        console.error('Error fetching instructor permissions:', error);
      }
    }

    fetchInstructorPermissions();
  }, []);

  async function handleReinstateUser(userId: string) {
    setReinstatingUserId(userId);
    try {
      const response = await fetch('/api/instructor/students/reinstate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to reinstate user');
      }

      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId
            ? {
                ...user,
                removedFromResumeBook: false,
                inactivityWarningCount: 0,
                mustBook: null,
              }
            : user
        )
      );
    } catch (error) {
      console.error('Error reinstating user:', error);
    } finally {
      setReinstatingUserId(null);
    }
  }

  function instructorLabelFor(id: string | null | undefined): string {
    return instructors.find((i) => i.id === id)?.label ?? 'None';
  }

  async function handleAssignInstructor(user: UserData, value: string) {
    const nextAssignedId = value || null;
    const nextEffectiveId = nextAssignedId ?? defaultInstructorId;
    const cancelsMeeting = Boolean(user.meeting && user.meeting.instructorId !== nextEffectiveId);

    if (
      cancelsMeeting &&
      !window.confirm(
        `${user.name} has a monthly meeting with ${user.meeting!.instructorLabel}. ` +
          `Changing their instructor will cancel it and email them to rebook with ${instructorLabelFor(nextEffectiveId)}. Continue?`
      )
    ) {
      return;
    }

    setAssigningUserId(user.id);
    setAssignResult(null);
    try {
      const response = await fetch('/api/instructor/students/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, instructorId: nextAssignedId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update instructor');
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? {
                ...u,
                assignedInstructorId: data.assignedInstructorId,
                effectiveInstructorId: data.effectiveInstructorId,
                meeting: data.meetingCancelled ? null : u.meeting,
              }
            : u
        )
      );
      setAssignResult(
        data.meetingCancelled
          ? data.emailSent
            ? { userId: user.id, tone: 'success', message: 'Meeting cancelled; student emailed to rebook.' }
            : { userId: user.id, tone: 'warning', message: 'Meeting cancelled, but the email could not be sent.' }
          : { userId: user.id, tone: 'success', message: 'Instructor updated.' }
      );
    } catch (error) {
      console.error('Error assigning instructor:', error);
      setAssignResult({
        userId: user.id,
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to update instructor',
      });
    } finally {
      setAssigningUserId(null);
    }
  }

  async function handleMissedMeeting(user: UserData, method: 'POST' | 'DELETE') {
    setMissedBusyUserId(user.id);
    setMissedResult(null);
    try {
      const response = await fetch('/api/instructor/students/missed-meeting', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Something went wrong');
      }
      setMissedResult({
        userId: user.id,
        tone: method === 'DELETE' || data.emailSent ? 'success' : 'warning',
        message:
          method === 'DELETE'
            ? 'Missed mark removed. They still need to book a new schedule.'
            : data.emailSent
              ? 'Marked missed; schedule cleared and student emailed.'
              : 'Marked missed and schedule cleared, but the email could not be sent.',
      });
      await fetchUsers();
    } catch (error) {
      setMissedResult({
        userId: user.id,
        tone: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    } finally {
      setMissedBusyUserId(null);
      setMissedConfirmUser(null);
    }
  }

  const minIssues = minIssuesFilter.trim() === '' ? null : Math.max(0, parseInt(minIssuesFilter, 10));
  const minIssuesValid = minIssues === null || !Number.isNaN(minIssues);

  const activeColors = effectiveSelection(activeFilter, STATUS_COLORS.length);
  const progressColors = effectiveSelection(progressFilter, STATUS_COLORS.length);
  const removedStates = effectiveSelection(removedFilter, REMOVED_STATES.length);

  function clearFilters() {
    setSearchQuery('');
    setMinIssuesFilter('');
    setActiveFilter([]);
    setProgressFilter([]);
    setRemovedFilter([]);
  }

  const matchesActive = (user: UserData) =>
    activeColors.length === 0 || activeColors.includes(user.activeStatus);
  const matchesProgress = (user: UserData) =>
    progressColors.length === 0 || progressColors.includes(user.progressStatus);
  const matchesRemoved = (user: UserData) =>
    removedStates.length === 0 || removedStates.includes(removedStateOf(user));

  const baseUsers = users
    .filter((user) => user.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((user) => !minIssuesValid || minIssues === null || user.openSource.issuesCompleted >= minIssues);

  // Each group's counts honor every other filter but not its own picks
  function colorOptions(
    pool: UserData[],
    statusOf: (user: UserData) => StatusColor,
    descriptions: Record<StatusColor, string>
  ): FilterOption<StatusColor>[] {
    return STATUS_COLORS.map((color) => ({
      ...color,
      description: descriptions[color.value],
      count: pool.filter((user) => statusOf(user) === color.value).length,
    }));
  }

  const activeOptions = colorOptions(
    baseUsers.filter(matchesProgress).filter(matchesRemoved),
    (user) => user.activeStatus,
    ACTIVE_STATUS_DESCRIPTIONS
  );
  const progressOptions = colorOptions(
    baseUsers.filter(matchesActive).filter(matchesRemoved),
    (user) => user.progressStatus,
    PROGRESS_STATUS_DESCRIPTIONS
  );
  const removedPool = baseUsers.filter(matchesActive).filter(matchesProgress);
  const removedOptions: FilterOption<RemovedState>[] = REMOVED_STATES.map((state) => ({
    ...state,
    count: removedPool.filter((user) => removedStateOf(user) === state.value).length,
  }));

  const filterChips: FilterChip[] = [
    ...(searchQuery.trim()
      ? [{ key: 'search', label: `Name: "${searchQuery.trim()}"`, onRemove: () => setSearchQuery('') }]
      : []),
    ...(minIssuesValid && minIssues !== null
      ? [{ key: 'minIssues', label: `Min issues: ${minIssues}`, onRemove: () => setMinIssuesFilter('') }]
      : []),
    ...selectionChips('Active', activeOptions, activeColors, setActiveFilter),
    ...selectionChips('Progress', progressOptions, progressColors, setProgressFilter),
    ...selectionChips('Status', removedOptions, removedStates, setRemovedFilter),
  ];
  const hasFiltersSet = filterChips.length > 0;

  const filteredAndSortedUsers = baseUsers
    .filter(matchesActive)
    .filter(matchesProgress)
    .filter(matchesRemoved)
    .sort((a, b) => {
      if (sortOrder === 'name-asc') {
        return a.name.localeCompare(b.name);
      } else if (sortOrder === 'name-desc') {
        return b.name.localeCompare(a.name);
      } else if (sortOrder === 'issues-high') {
        return b.openSource.issuesCompleted - a.openSource.issuesCompleted;
      } else if (sortOrder === 'issues-low') {
        return a.openSource.issuesCompleted - b.openSource.issuesCompleted;
      }
      return 0;
    });

  if (loading) {
    return <div className="text-gray-400">Loading users...</div>;
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 mb-6 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-electric-blue focus:ring-1 focus:ring-electric-blue"
          />
        </div>

        <div className="sm:w-36">
          <input
            type="number"
            min={0}
            placeholder="Min issues"
            value={minIssuesFilter}
            onChange={(e) => setMinIssuesFilter(e.target.value)}
            className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-electric-blue focus:ring-1 focus:ring-electric-blue [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="Minimum issues completed"
          />
        </div>

        <div className="sm:w-48">
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'name-asc' | 'name-desc' | 'issues-high' | 'issues-low')}
            className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-electric-blue focus:ring-1 focus:ring-electric-blue"
          >
            <option value="name-asc">Sort: A-Z</option>
            <option value="name-desc">Sort: Z-A</option>
            <option value="issues-high">Issues: High-Low</option>
            <option value="issues-low">Issues: Low-High</option>
          </select>
        </div>

        <FilterDropdown label="Active" options={activeOptions} selected={activeFilter} onChange={setActiveFilter} />
        <FilterDropdown label="Progress" options={progressOptions} selected={progressFilter} onChange={setProgressFilter} />
        <FilterDropdown label="Status" options={removedOptions} selected={removedFilter} onChange={setRemovedFilter} />

        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams();
            if (searchQuery.trim()) params.set('search', searchQuery.trim());
            if (minIssuesValid && minIssues !== null) params.set('minIssues', String(minIssues));
            if (activeColors.length > 0) params.set('active', activeColors.join(','));
            if (progressColors.length > 0) params.set('progress', progressColors.join(','));
            if (removedStates.length > 0) params.set('removed', removedStates.join(','));
            const url = `/api/instructor/students/export${params.toString() ? `?${params.toString()}` : ''}`;
            window.open(url, '_blank', 'noopener,noreferrer');
          }}
          className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-200 hover:border-electric-blue focus:outline-none focus:ring-1 focus:ring-electric-blue transition-colors whitespace-nowrap"
        >
          Export CSV
        </button>
      </div>

      {users.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          <span className="text-gray-400 text-sm">
            Showing {filteredAndSortedUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
          </span>
          {hasFiltersSet && (
            <div className="flex flex-wrap items-center gap-2">
              {filterChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 rounded-full border border-electric-blue bg-white pl-3 pr-1.5 py-0.5 text-sm text-gray-900"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={`Remove filter ${chip.label}`}
                    className="rounded-full p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-electric-blue hover:underline font-medium"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {filteredAndSortedUsers.map((user) => (
          <div
            key={user.id}
            className="bg-white border border-gray-200 rounded-lg px-6 py-4 hover:border-electric-blue transition-colors w-full"
          >
            <div className="flex gap-4 xl:gap-6 items-start">
              <div className="w-[140px] min-w-[140px] shrink-0">
                <Link
                  href={`/dashboard?userId=${user.id}`}
                  title={user.name}
                  className="text-gray-900 font-medium text-lg hover:text-electric-blue transition-colors block truncate"
                >
                  {user.name}
                </Link>
                {user.removedFromResumeBook && (
                  <div className="mt-1 flex flex-col items-start gap-2">
                    <span className="inline-block px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-300 rounded">
                      REMOVED
                    </span>
                    {canMutateUserData && (
                      <button
                        type="button"
                        onClick={() => handleReinstateUser(user.id)}
                        disabled={reinstatingUserId === user.id}
                        className="px-2.5 py-1 text-xs font-semibold rounded border border-green-600 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {reinstatingUserId === user.id ? 'Reinstating...' : 'Reinstate'}
                      </button>
                    )}
                  </div>
                )}
                {!user.removedFromResumeBook && user.inactivityWarningCount > 0 && (
                  <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded border ${
                    user.inactivityWarningCount === 2
                      ? 'bg-orange-50 text-orange-700 border-orange-300'
                      : 'bg-yellow-50 text-yellow-700 border-yellow-300'
                  }`}>
                    Warning {user.inactivityWarningCount}/2
                  </span>
                )}
                {!DEBUG_MODE && instructors.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    {canAssign ? (
                      <label className="block">
                        <span className="block mb-0.5">Instructor</span>
                        <select
                          value={user.assignedInstructorId ?? ''}
                          onChange={(e) => handleAssignInstructor(user, e.target.value)}
                          disabled={assigningUserId === user.id}
                          className="w-full px-1.5 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 focus:outline-none focus:border-electric-blue focus:ring-1 focus:ring-electric-blue disabled:opacity-50"
                        >
                          <option value="">Default ({instructorLabelFor(defaultInstructorId)})</option>
                          {instructors.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span>
                        Instructor:{' '}
                        <span className="text-gray-900 font-medium">
                          {instructorLabelFor(user.effectiveInstructorId)}
                        </span>
                        {!user.assignedInstructorId && ' (default)'}
                      </span>
                    )}
                    {assignResult?.userId === user.id && (
                      <p
                        className={`mt-1 ${
                          assignResult.tone === 'success'
                            ? 'text-green-700'
                            : assignResult.tone === 'warning'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {assignResult.message}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-4 xl:gap-6 items-start flex-1 min-w-0">
                <div className="flex flex-col gap-2 w-[110px] min-w-[110px] shrink-0">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-4 h-4 rounded-full flex-shrink-0 ${
                      user.activeStatus === 2 ? 'bg-green-500' :
                      user.activeStatus === 1 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`} />
                    <span className="text-gray-600 text-sm font-medium whitespace-nowrap">Active</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-4 h-4 rounded-full flex-shrink-0 ${
                      user.progressStatus === 2 ? 'bg-green-500' :
                      user.progressStatus === 1 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`} />
                    <span className="text-gray-600 text-sm font-medium whitespace-nowrap">Progress</span>
                  </div>
                </div>

                <div className="w-[220px] min-w-[220px] shrink-0">
                  <div className="text-gray-600 text-sm font-medium mb-1">Open Source</div>
                  <div className="text-gray-400 text-sm flex flex-col gap-2">
                    <span>
                      Issues Completed:{' '}
                      <span className="text-gray-900 font-medium">{user.openSource.issuesCompleted}</span>
                    </span>
                    <span>
                      Partnerships Completed:{' '}
                      <span className="text-gray-900 font-medium">{user.openSource.partnershipsCompleted ?? 0}</span>
                    </span>
                    <div className="relative h-8 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-electric-blue rounded-full"
                        style={{
                          width: `${user.openSource.totalCount > 0
                            ? Math.min(100, (user.openSource.completedCount / user.openSource.totalCount) * 100)
                            : 0}%`,
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-sm text-gray-100 font-medium">
                          Criteria:{' '}
                          <span className="text-gray-900 font-semibold">
                            {user.openSource.completedCount}/{user.openSource.totalCount}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-[165px] min-w-[165px] shrink-0">
                  <div className="text-gray-600 text-sm font-medium mb-1">Applications</div>
                  <div className="text-gray-400 text-sm flex flex-col gap-2">
                    <span>Last Month: <span className="text-gray-900 font-medium">{user.applications.lastMonth}</span></span>
                    <span>All Time: <span className="text-gray-900 font-medium">{user.applications.allTime}</span></span>
                  </div>
                </div>

                <div className="w-[165px] min-w-[165px] shrink-0">
                  <div className="text-gray-600 text-sm font-medium mb-1">Events</div>
                  <div className="text-gray-400 text-sm flex flex-col gap-2">
                    <span>Last Month: <span className="text-gray-900 font-medium">{user.events.lastMonth}</span></span>
                    <span>All Time: <span className="text-gray-900 font-medium">{user.events.allTime}</span></span>
                  </div>
                </div>

                <div className="w-[165px] min-w-[165px] shrink-0">
                  <div className="text-gray-600 text-sm font-medium mb-1">Coffee Chats</div>
                  <div className="text-gray-400 text-sm flex flex-col gap-2">
                    <span>Last Month: <span className="text-gray-900 font-medium">{user.coffeeChats.lastMonth}</span></span>
                    <span>All Time: <span className="text-gray-900 font-medium">{user.coffeeChats.allTime}</span></span>
                  </div>
                </div>

                <div className="w-[165px] min-w-[165px] shrink-0">
                  <div className="text-gray-600 text-sm font-medium mb-1">Next 1:1</div>
                  <div className="text-gray-400 text-sm flex flex-col gap-2">
                    {user.meeting?.nextStart ? (
                      <>
                        <span className="text-gray-900 font-medium">
                          {formatMeetingDate(user.meeting.nextStart, user.meeting.timezone)}
                        </span>
                        <span>{formatMeetingTime(user.meeting.nextStart, user.meeting.timezone)}</span>
                      </>
                    ) : (
                      <span>Not booked</span>
                    )}
                    {user.meeting?.movedFrom && (
                      <span className="text-xs text-amber-700">
                        Moved from {formatMeetingDate(user.meeting.movedFrom, user.meeting.timezone)}
                      </span>
                    )}
                    {user.meeting && user.meeting.instructorId !== currentInstructorId && (
                      <span className="text-xs">with {user.meeting.instructorLabel}</span>
                    )}
                    {user.meeting?.lastStart && !user.mustBook && (
                      <span className="text-xs">
                        Last: {formatMeetingDate(user.meeting.lastStart, user.meeting.timezone)}
                        {user.meeting.lastMissed ? (
                          <span className="text-red-700"> (missed)</span>
                        ) : (
                          (user.meeting.instructorId === currentInstructorId || canMutateUserData) && (
                            <>
                              {' · '}
                              <button
                                type="button"
                                onClick={() => setMissedConfirmUser(user)}
                                disabled={missedBusyUserId === user.id}
                                className="font-semibold text-red-700 hover:underline disabled:opacity-50"
                              >
                                Mark missed
                              </button>
                            </>
                          )
                        )}
                      </span>
                    )}
                    {user.mustBook && (
                      <span className="text-xs text-red-700">
                        {user.mustBook.reason === 'missedMeeting' && user.lastMissedStart
                          ? `Missed ${formatMeetingDate(user.lastMissedStart, DEFAULT_AVAILABILITY_TIMEZONE)}`
                          : 'Skipped booking'}
                        {' · '}
                        {user.mustBook.finalWarningSent ? 'removed after ' : 'must book by '}
                        {formatMeetingDate(user.mustBook.deadline, DEFAULT_AVAILABILITY_TIMEZONE)},{' '}
                        {formatMeetingTime(user.mustBook.deadline, DEFAULT_AVAILABILITY_TIMEZONE)}
                        {user.mustBook.finalWarningSent && (
                          <span className="block font-semibold">Final warning sent</span>
                        )}
                        {user.mustBook.reason === 'missedMeeting' &&
                          (user.effectiveInstructorId === currentInstructorId || canMutateUserData) && (
                            <button
                              type="button"
                              onClick={() => handleMissedMeeting(user, 'DELETE')}
                              disabled={missedBusyUserId === user.id}
                              className="block font-semibold text-electric-blue hover:underline disabled:opacity-50"
                            >
                              {missedBusyUserId === user.id ? 'Undoing…' : 'Undo'}
                            </button>
                          )}
                      </span>
                    )}
                    {(user.missedCount ?? 0) > 0 && (
                      <span className="text-xs">
                        Missed 1:1s: <span className="text-gray-900 font-medium">{user.missedCount}</span>
                      </span>
                    )}
                    {missedResult?.userId === user.id && (
                      <span
                        className={`text-xs ${
                          missedResult.tone === 'success'
                            ? 'text-green-700'
                            : missedResult.tone === 'warning'
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }`}
                      >
                        {missedResult.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredAndSortedUsers.length === 0 && (
        <div className="text-gray-400 text-center py-8">
          {hasFiltersSet ? 'No users match the current filters.' : 'No users found.'}
        </div>
      )}

      {missedConfirmUser?.meeting?.lastStart && (
        <ModalOverlay onClose={() => !missedBusyUserId && setMissedConfirmUser(null)}>
          <ModalPanel size="md">
            <h3 className="text-lg font-semibold text-gray-900">Mark this 1:1 as missed?</h3>
            <p className="text-sm text-gray-700 mt-2">
              {missedConfirmUser.name} missed their 1:1 on{' '}
              <span className="font-semibold text-gray-900">
                {formatMeetingDate(missedConfirmUser.meeting.lastStart, missedConfirmUser.meeting.timezone)},{' '}
                {formatMeetingTime(missedConfirmUser.meeting.lastStart, missedConfirmUser.meeting.timezone)}
              </span>
              .
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-700 list-disc pl-5">
              <li>Their whole monthly schedule is cancelled, including on your Google Calendar.</li>
              <li>They get an email asking them to book a new monthly 1:1 within 72 hours.</li>
              <li>
                If they don&apos;t, they get a final warning, and are removed from the Resume Book 24
                hours after that.
              </li>
            </ul>
            <p className="text-xs text-gray-500 mt-3">
              Undo removes the missed mark and stops the clock, but doesn&apos;t restore their schedule.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setMissedConfirmUser(null)}
                disabled={Boolean(missedBusyUserId)}
                className="px-4 py-2 rounded-lg font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleMissedMeeting(missedConfirmUser, 'POST')}
                disabled={Boolean(missedBusyUserId)}
                className="px-4 py-2 rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {missedBusyUserId ? 'Marking…' : 'Mark missed'}
              </button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}
    </>
  );
}
