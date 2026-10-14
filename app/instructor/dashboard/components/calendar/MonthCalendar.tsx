"use client"

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, MapPin, RefreshCw, Video } from 'lucide-react';
import {
  buildMonthGrid,
  formatEventTimeRange,
  groupEventsByLocalDate,
  localDateKey,
  type CalendarEventItem,
} from '@/app/lib/calendar/month-grid';

type Props = { timezone: string };

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MAX_DOTS = 3;

function formatDateKey(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(
    new Date(Date.UTC(y, m - 1, d, 12))
  );
}

function MonthGrid({
  year,
  month,
  todayKey,
  selectedKey,
  eventsByDay,
  onSelect,
}: {
  year: number;
  month: number;
  todayKey: string;
  selectedKey: string;
  eventsByDay: Map<string, CalendarEventItem[]>;
  onSelect: (dateKey: string) => void;
}) {
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const title = formatDateKey(`${year}-${String(month).padStart(2, '0')}-01`, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-400 mb-1">
        {WEEKDAY_INITIALS.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((cell) => {
          if (!cell.inMonth) {
            return (
              <div key={cell.dateKey} className="h-12 flex items-start justify-center pt-1.5 text-xs text-gray-300">
                {cell.day}
              </div>
            );
          }
          const dayEvents = eventsByDay.get(cell.dateKey) ?? [];
          const selected = cell.dateKey === selectedKey;
          const isToday = cell.dateKey === todayKey;
          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => onSelect(cell.dateKey)}
              aria-pressed={selected}
              aria-label={`${formatDateKey(cell.dateKey, { weekday: 'long', month: 'long', day: 'numeric' })}, ${dayEvents.length} ${dayEvents.length === 1 ? '1:1' : '1:1s'}`}
              className={`h-12 flex flex-col items-center pt-1.5 gap-1 rounded-lg text-xs font-medium transition-colors ${
                selected
                  ? 'bg-electric-blue text-white'
                  : `text-gray-800 hover:bg-gray-100 ${isToday ? 'ring-2 ring-electric-blue ring-inset' : ''}`
              }`}
            >
              <span>{cell.day}</span>
              {dayEvents.length > 0 && (
                <span className="flex items-center gap-0.5">
                  {dayEvents.slice(0, MAX_DOTS).map((e, i) => (
                    <span
                      key={`${e.id}-${i}`}
                      className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : 'bg-electric-blue'}`}
                    />
                  ))}
                  {dayEvents.length > MAX_DOTS && (
                    <span className={`text-[9px] leading-none ${selected ? 'text-white' : 'text-gray-500'}`}>
                      +{dayEvents.length - MAX_DOTS}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MonthCalendar({ timezone }: Props) {
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<'reconnect' | 'failed' | null>(null);
  const todayKey = localDateKey(new Date(), timezone);
  const [selectedKey, setSelectedKey] = useState(todayKey);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/instructor/calendar/events', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load events');
      if (data.error === 'reconnect') {
        setError('reconnect');
        setEvents([]);
        return;
      }
      setEvents((data.events as CalendarEventItem[]) ?? []);
    } catch (err) {
      console.error(err);
      setError('failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const eventsByDay = useMemo(() => groupEventsByLocalDate(events, timezone), [events, timezone]);

  const [todayYear, todayMonth] = todayKey.split('-').map(Number);
  const nextYear = todayMonth === 12 ? todayYear + 1 : todayYear;
  const nextMonth = todayMonth === 12 ? 1 : todayMonth + 1;
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  return (
    <section className="border border-gray-200 rounded-lg bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <CalendarDays className="w-6 h-6 text-electric-blue shrink-0 mt-0.5" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Your calendar</h2>
            <p className="text-sm text-gray-500 mt-1">
              Your OpenSourceResume 1:1s this month and next, from your Google Calendar.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error === 'reconnect' && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
          Google needs you to sign in again. Click Disconnect above, then Connect Google Calendar.
        </p>
      )}
      {error === 'failed' && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-red-800 bg-red-50 border border-red-300 rounded-lg px-4 py-3 mb-4">
          Could not load your 1:1s from Google Calendar.
          <button
            type="button"
            onClick={() => load(false)}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20rem] animate-pulse">
          {[0, 1].map((i) => (
            <div key={i}>
              <div className="h-4 w-28 bg-gray-200 rounded mb-3" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }, (_, j) => (
                  <div key={j} className="h-12 rounded-lg bg-gray-100" />
                ))}
              </div>
            </div>
          ))}
          <div className="h-64 rounded-lg bg-gray-100 md:col-span-2 lg:col-span-1" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20rem]">
          <MonthGrid
            year={todayYear}
            month={todayMonth}
            todayKey={todayKey}
            selectedKey={selectedKey}
            eventsByDay={eventsByDay}
            onSelect={setSelectedKey}
          />
          <MonthGrid
            year={nextYear}
            month={nextMonth}
            todayKey={todayKey}
            selectedKey={selectedKey}
            eventsByDay={eventsByDay}
            onSelect={setSelectedKey}
          />

          <aside className="md:col-span-2 lg:col-span-1 rounded-lg border border-gray-200 bg-gray-50 p-4 lg:max-h-[24rem] lg:overflow-y-auto">
            <h3 className="text-sm font-semibold text-gray-900">
              {formatDateKey(selectedKey, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              {selectedEvents.length === 0
                ? 'No 1:1s'
                : `${selectedEvents.length} ${selectedEvents.length === 1 ? '1:1' : '1:1s'}`}
            </p>
            <ul className="space-y-2">
              {selectedEvents.map((e, i) => (
                <li
                  key={`${e.id}-${i}`}
                  className="rounded-lg border border-electric-blue/40 border-l-4 border-l-electric-blue bg-white px-3 py-2"
                >
                  <div className="text-xs text-gray-500">{formatEventTimeRange(e, timezone)}</div>
                  <div className="text-sm font-semibold text-gray-900 break-words">{e.title}</div>
                  {e.location && (
                    <div className="flex items-start gap-1 text-xs text-gray-600 mt-1 break-words">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-px" />
                      {e.location}
                    </div>
                  )}
                  {(e.meetLink || e.htmlLink) && (
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs font-medium">
                      {e.meetLink && (
                        <a
                          href={e.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-electric-blue hover:underline"
                        >
                          <Video className="w-3.5 h-3.5" />
                          Join Meet
                        </a>
                      )}
                      {e.htmlLink && (
                        <a
                          href={e.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open in Google Calendar
                        </a>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </section>
  );
}
