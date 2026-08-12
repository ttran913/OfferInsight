"use client"

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface UserData {
  id: string;
  name: string;
  email: string | null;
  activeStatus: number; // 0 = red, 1 = yellow, 2 = green
  progressStatus: number; // 0 = red, 1 = yellow, 2 = green
  referralCount: number; // Number of referrals received
  removedFromResumeBook: boolean;
  inactivityWarningCount: number; // 0 = none, 1 = first warning, 2 = second warning, 3 = removed
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

// ============================================================================
// DEBUG MODE - Toggle this boolean to enable/disable dummy debug cards
// Set to true to show 20 dummy user cards for testing the UI layout
// Set to false to fetch real user data from the API
// ============================================================================
const DEBUG_MODE = false;

// ============================================================================
// DEBUG: Generate dummy user data for testing
// This function creates 20 mock users with varied metrics and statuses
// to help visualize different card states in the dashboard
// ============================================================================
function generateDebugUsers(): UserData[] {
  const names = [
    'Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Ethan Hunt',
    'Fiona Chen', 'George Williams', 'Hannah Kim', 'Isaac Newton', 'Julia Roberts',
    'Kevin Zhang', 'Laura Martinez', 'Michael Jordan', 'Nancy Drew', 'Oliver Twist',
    'Patricia Lee', 'Quinn Anderson', 'Rachel Green', 'Steve Jobs', 'Tina Turner'
  ];

  return names.map((name, index) => {
    // Vary the data to show different status combinations
    const hasGoodProgress = index % 4 === 0; // Every 4th user has good progress
    const hasMediumProgress = index % 4 === 1; // Every 4th user has medium progress
    const isActive = index % 3 === 0; // Every 3rd user is active
    const isMediumActive = index % 3 === 1; // Every 3rd user is medium active

    // Determine statuses
    const activeStatus = isActive ? 2 : (isMediumActive ? 1 : 0); // 2=green, 1=yellow, 0=red
    const progressStatus = hasGoodProgress ? 2 : (hasMediumProgress ? 1 : 0);

    // Generate varied metrics
    const applicationsLastMonth = hasGoodProgress ? Math.floor(Math.random() * 5) + 2 : (hasMediumProgress ? 1 : Math.floor(Math.random() * 2));
    const eventsLastMonth = hasGoodProgress ? Math.floor(Math.random() * 3) + 1 : (hasMediumProgress ? Math.floor(Math.random() * 2) : 0);
    const coffeeChatsLastMonth = hasGoodProgress ? Math.floor(Math.random() * 6) + 4 : (hasMediumProgress ? Math.floor(Math.random() * 5) + 2 : Math.floor(Math.random() * 3));

    // Generate referral count - some users have referrals (exciting!)
    const referralCount = hasGoodProgress && index % 5 === 0 
      ? Math.floor(Math.random() * 3) + 1  // 1-3 referrals for some successful users
      : hasGoodProgress && index % 7 === 0
      ? Math.floor(Math.random() * 2) + 1  // 1-2 referrals for others
      : 0; // Most users have 0 referrals
    
    const issuesCompleted = Math.floor(Math.random() * 5);
    const partnershipsCompleted = Math.floor(Math.random() * 4);
    const totalCriteria = Math.max(issuesCompleted + Math.floor(Math.random() * 5), 1);

    // Some users are removed for testing
    const removedFromResumeBook = index % 10 === 9;
    const inactivityWarningCount = removedFromResumeBook ? 3 : (index % 8 === 7 ? 2 : (index % 6 === 5 ? 1 : 0));

    return {
      id: `debug-${index}`,
      name: name,
      email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
      activeStatus,
      progressStatus,
      referralCount,
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

export default function InstructorDashboard() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [reinstatingUserId, setReinstatingUserId] = useState<string | null>(null);
  const [canMutateUserData, setCanMutateUserData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [minIssuesFilter, setMinIssuesFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'name-asc' | 'name-desc' | 'issues-high' | 'issues-low'>('name-asc');

  useEffect(() => {
    // ============================================================================
    // DEBUG: Skip API call and use dummy data if debug mode is enabled
    // ============================================================================
    if (DEBUG_MODE) {
      setUsers(generateDebugUsers());
      setLoading(false);
      return;
    }

    // ============================================================================
    // PRODUCTION: Fetch real user data from the API
    // ============================================================================
    async function fetchUsers() {
      try {
        const response = await fetch('/api/instructor/students');
        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }
        const data = await response.json();
        setUsers(data.students || []);
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

  // Parse min issues filter: only apply when a valid non-negative number is entered
  const minIssues = minIssuesFilter.trim() === '' ? null : Math.max(0, parseInt(minIssuesFilter, 10));
  const minIssuesValid = minIssues === null || !Number.isNaN(minIssues);

  // Filter and sort users
  const filteredAndSortedUsers = users
    .filter((user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter((user) => {
      if (minIssuesValid && minIssues !== null) {
        return user.openSource.issuesCompleted >= minIssues;
      }
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
    return (
      <div className="min-h-[calc(100dvh-var(--navbar-height))] bg-white text-gray-900">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-6">Instructor Dashboard</h1>
          <div className="text-gray-400">Loading users...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-var(--navbar-height))] bg-white text-gray-900">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Instructor Dashboard</h1>
        
        {/* Search and Sort Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 flex-wrap">
          {/* Search Input */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-electric-blue focus:ring-1 focus:ring-electric-blue"
            />
          </div>

          {/* Min issues filter */}
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
          
          {/* Sort Dropdown */}
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

          {/* Export CSV - uses current search and min-issues filter */}
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              if (searchQuery.trim()) params.set('search', searchQuery.trim());
              if (minIssuesValid && minIssues !== null) params.set('minIssues', String(minIssues));
              const url = `/api/instructor/students/export${params.toString() ? `?${params.toString()}` : ''}`;
              window.open(url, '_blank', 'noopener,noreferrer');
            }}
            className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-200 hover:border-electric-blue focus:outline-none focus:ring-1 focus:ring-electric-blue transition-colors whitespace-nowrap"
          >
            Export CSV
          </button>
        </div>
        
        {/* Result Count */}
        {users.length > 0 && (
          <div className="text-gray-400 text-sm mb-4">
            Showing {filteredAndSortedUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
            {minIssuesValid && minIssues !== null && ` with ≥ ${minIssues} issue${minIssues !== 1 ? 's' : ''}`}
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
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg w-fit border min-w-[120px] ${
                      user.referralCount > 0
                        ? 'bg-green-50 border-green-400'
                        : 'bg-gray-50 border-gray-300'
                    }`}>
                      <span className={`font-bold text-sm whitespace-nowrap ${
                        user.referralCount > 0 ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        🎉 {user.referralCount} Referral{user.referralCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredAndSortedUsers.length === 0 && (
          <div className="text-gray-400 text-center py-8">
            {searchQuery ? 'No users found matching your search.' : 'No users found.'}
          </div>
        )}
      </div>
    </div>
  );
}

