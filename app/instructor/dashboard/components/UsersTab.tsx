"use client"

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface UserData {
  id: string;
  name: string;
  email: string | null;
  activeStatus: number; // 0 = red, 1 = yellow, 2 = green
  progressStatus: number; // 0 = red, 1 = yellow, 2 = green
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
    /** ISO start of an upcoming date the student skipped */
    skippedStart: string | null;
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

type ActiveFilter = 'all' | 2 | 1 | 0;
type RemovedFilter = 'all' | 'removed' | 'not-removed';

const ACTIVE_FILTER_OPTIONS: { value: ActiveFilter; label: string; dotClass: string | null; title: string }[] = [
  { value: 'all', label: 'All', dotClass: null, title: 'Show all activity levels' },
  { value: 2, label: 'Green', dotClass: 'bg-green-500', title: 'Active in the last 7 days' },
  { value: 1, label: 'Yellow', dotClass: 'bg-yellow-500', title: 'Active in the last 30 days' },
  { value: 0, label: 'Red', dotClass: 'bg-red-500', title: 'No activity in the last 30 days' },
];

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
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [removedFilter, setRemovedFilter] = useState<RemovedFilter>('all');
  const [sortOrder, setSortOrder] = useState<'name-asc' | 'name-desc' | 'issues-high' | 'issues-low'>('name-asc');
  const [instructors, setInstructors] = useState<AssignableInstructor[]>([]);
  const [defaultInstructorId, setDefaultInstructorId] = useState<string | null>(null);
  const [currentInstructorId, setCurrentInstructorId] = useState<string | null>(null);
  const [canAssign, setCanAssign] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [assignResult, setAssignResult] = useState<AssignResult | null>(null);

  useEffect(() => {
    if (DEBUG_MODE) {
      setUsers(generateDebugUsers());
      setLoading(false);
      return;
    }

    async function fetchUsers() {
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
    }
    fetchUsers();
  }, []);

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

  const minIssues = minIssuesFilter.trim() === '' ? null : Math.max(0, parseInt(minIssuesFilter, 10));
  const minIssuesValid = minIssues === null || !Number.isNaN(minIssues);

  const hasFiltersSet =
    searchQuery.trim() !== '' ||
    minIssuesFilter.trim() !== '' ||
    activeFilter !== 'all' ||
    removedFilter !== 'all';

  function clearFilters() {
    setSearchQuery('');
    setMinIssuesFilter('');
    setActiveFilter('all');
    setRemovedFilter('all');
  }

  const activeFilterLabel = ACTIVE_FILTER_OPTIONS.find((option) => option.value === activeFilter)?.label;

  const scopedUsers = showAll
    ? users
    : users.filter((user) => user.effectiveInstructorId === currentInstructorId);

  const filteredAndSortedUsers = scopedUsers
    .filter((user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter((user) => {
      if (minIssuesValid && minIssues !== null) {
        return user.openSource.issuesCompleted >= minIssues;
      }
      return true;
    })
    .filter((user) => activeFilter === 'all' || user.activeStatus === activeFilter)
    .filter((user) => {
      if (removedFilter === 'removed') return user.removedFromResumeBook;
      if (removedFilter === 'not-removed') return !user.removedFromResumeBook;
      return true;
    })
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
        {!DEBUG_MODE && (
          <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-1 self-start" role="group" aria-label="Student scope">
            {[
              { value: true, label: 'All students' },
              { value: false, label: 'My students' },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setShowAll(option.value)}
                aria-pressed={showAll === option.value}
                className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
                  showAll === option.value
                    ? 'bg-white text-electric-blue shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

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

        <div className="sm:w-44">
          <select
            value={removedFilter}
            onChange={(e) => setRemovedFilter(e.target.value as RemovedFilter)}
            className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-electric-blue focus:ring-1 focus:ring-electric-blue"
            aria-label="Filter by removed status"
          >
            <option value="all">Status: All</option>
            <option value="not-removed">Not removed</option>
            <option value="removed">Removed</option>
          </select>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Filter by active status">
          <span className="text-gray-600 text-sm font-medium mr-1">Active:</span>
          {ACTIVE_FILTER_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              title={option.title}
              aria-pressed={activeFilter === option.value}
              onClick={() => setActiveFilter(option.value)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-electric-blue ${
                activeFilter === option.value
                  ? 'bg-white border-electric-blue text-gray-900'
                  : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {option.dotClass && <span className={`w-3 h-3 rounded-full ${option.dotClass}`} />}
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams();
            if (searchQuery.trim()) params.set('search', searchQuery.trim());
            if (minIssuesValid && minIssues !== null) params.set('minIssues', String(minIssues));
            if (activeFilter !== 'all') params.set('active', String(activeFilter));
            if (removedFilter !== 'all') params.set('removed', removedFilter);
            if (!showAll) params.set('mine', '1');
            const url = `/api/instructor/students/export${params.toString() ? `?${params.toString()}` : ''}`;
            window.open(url, '_blank', 'noopener,noreferrer');
          }}
          className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-200 hover:border-electric-blue focus:outline-none focus:ring-1 focus:ring-electric-blue transition-colors whitespace-nowrap"
        >
          Export CSV
        </button>
      </div>

      {users.length > 0 && (
        <div className="flex items-center gap-3 text-gray-400 text-sm mb-4">
          <span>
            Showing {filteredAndSortedUsers.length} of {scopedUsers.length} user{scopedUsers.length !== 1 ? 's' : ''}
            {!showAll && ' assigned to you'}
            {searchQuery && ` matching "${searchQuery}"`}
            {minIssuesValid && minIssues !== null && ` with ≥ ${minIssues} issue${minIssues !== 1 ? 's' : ''}`}
            {activeFilter !== 'all' && ` · Active: ${activeFilterLabel?.toLowerCase()}`}
            {removedFilter === 'removed' && ' · Removed only'}
            {removedFilter === 'not-removed' && ' · Not removed'}
          </span>
          {hasFiltersSet && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-electric-blue hover:underline font-medium"
            >
              Clear filters
            </button>
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
                    {user.meeting?.skippedStart && (
                      <span className="text-xs text-amber-700">
                        Skipping {formatMeetingDate(user.meeting.skippedStart, user.meeting.timezone)}
                      </span>
                    )}
                    {user.meeting && user.meeting.instructorId !== currentInstructorId && (
                      <span className="text-xs">with {user.meeting.instructorLabel}</span>
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
          {hasFiltersSet
            ? 'No users match the current filters.'
            : showAll
            ? 'No users found.'
            : 'No students are assigned to you yet.'}
        </div>
      )}
    </>
  );
}
