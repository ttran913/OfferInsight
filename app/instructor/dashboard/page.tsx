"use client"

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Users, Calendar } from 'lucide-react';
import UsersTab from './components/UsersTab';
import CalendarTab from './components/CalendarTab';

type InstructorTab = 'users' | 'calendar';

function InstructorDashboardInner() {
  const searchParams = useSearchParams();
  const activeTab: InstructorTab = searchParams.get('tab') === 'calendar' ? 'calendar' : 'users';

  function setActiveTab(tab: InstructorTab) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    url.searchParams.delete('calendarConnected');
    url.searchParams.delete('calendarError');
    window.history.replaceState(null, '', url);
  }

  return (
    <div className="min-h-[calc(100dvh-var(--navbar-height))] bg-white text-gray-900">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Instructor Dashboard</h1>

        <section className="mb-8">
          <div className="flex border-b border-gray-200 bg-white rounded-t-lg overflow-x-auto">
            <div className="flex min-w-full">
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold border-r border-gray-200 transition-colors whitespace-nowrap ${
                  activeTab === 'users'
                    ? 'bg-electric-blue text-white'
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Users className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />
                Users
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('calendar')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold transition-colors whitespace-nowrap ${
                  activeTab === 'calendar'
                    ? 'bg-electric-blue text-white'
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Calendar className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />
                Calendar
              </button>
            </div>
          </div>
        </section>

        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'calendar' && <CalendarTab />}
      </div>
    </div>
  );
}

export default function InstructorDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100dvh-var(--navbar-height))] bg-white text-gray-900">
          <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Instructor Dashboard</h1>
            <div className="text-gray-400">Loading…</div>
          </div>
        </div>
      }
    >
      <InstructorDashboardInner />
    </Suspense>
  );
}
