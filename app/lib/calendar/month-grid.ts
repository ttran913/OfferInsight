import { getZonedParts } from './slots';

export type CalendarEventItem = {
  id: string;
  title: string;
  /** ISO instant for timed events; YYYY-MM-DD for all-day events */
  start: string;
  /** ISO instant for timed events; exclusive YYYY-MM-DD for all-day events */
  end: string | null;
  allDay: boolean;
  location: string | null;
  htmlLink: string | null;
  meetLink: string | null;
};

export type MonthGridDay = {
  /** YYYY-MM-DD */
  dateKey: string;
  day: number;
  inMonth: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function keyFromUtcDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDaysToDateKey(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return keyFromUtcDate(new Date(Date.UTC(y, m - 1, d + delta)));
}

/** YYYY-MM-DD of an instant as seen in `timezone`. */
export function localDateKey(date: Date, timezone: string): string {
  const p = getZonedParts(date, timezone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Sunday-first weeks covering a month (month is 1-based), padded with adjacent-month days. */
export function buildMonthGrid(year: number, month: number): MonthGridDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = first.getUTCDay();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const weeks: MonthGridDay[][] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 - leading + i));
    const cell = {
      dateKey: keyFromUtcDate(d),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1,
    };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}

/**
 * Bucket events by local day. Timed events land on their local start date;
 * all-day events land on every day from start to the day before their exclusive end.
 */
export function groupEventsByLocalDate(
  events: CalendarEventItem[],
  timezone: string
): Map<string, CalendarEventItem[]> {
  const byDay = new Map<string, CalendarEventItem[]>();
  const push = (key: string, event: CalendarEventItem) => {
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  };

  for (const event of events) {
    if (event.allDay) {
      const endKey = event.end && event.end > event.start ? event.end : addDaysToDateKey(event.start, 1);
      for (let key = event.start, guard = 0; key < endKey && guard < 400; key = addDaysToDateKey(key, 1), guard++) {
        push(key, event);
      }
    } else {
      push(localDateKey(new Date(event.start), timezone), event);
    }
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      if (a.allDay) return a.start.localeCompare(b.start);
      return Date.parse(a.start) - Date.parse(b.start);
    });
  }
  return byDay;
}

export function formatEventTimeRange(event: CalendarEventItem, timezone: string): string {
  if (event.allDay) return 'All day';
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
  const start = fmt.format(new Date(event.start));
  return event.end ? `${start} – ${fmt.format(new Date(event.end))}` : start;
}
