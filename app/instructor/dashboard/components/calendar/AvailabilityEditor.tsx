"use client"

import { useEffect, useRef, useState } from 'react';
import { Copy, Plus, X } from 'lucide-react';
import { DAY_LABELS } from '@/app/lib/calendar/constants';
import {
  DEFAULT_RANGE,
  TIME_OPTIONS,
  formatTime12,
  newRangeKey,
  rangeErrors,
  slotCountForDay,
  type DayAvailability,
  type TimeRange,
} from './availability-model';

type Props = {
  days: DayAvailability[];
  onChange: (days: DayAvailability[]) => void;
  durationMinutes: number;
};

function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + delta, 23 * 60 + 45);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function TimeSelect({
  value,
  invalid,
  onChange,
  label,
}: {
  value: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  label: string;
}) {
  const options = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [...TIME_OPTIONS, value].sort();
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-2 py-1.5 bg-white border rounded-lg text-sm text-gray-900 ${
        invalid ? 'border-red-400 focus:outline-red-500' : 'border-gray-300'
      }`}
    >
      {options.map((t) => (
        <option key={t} value={t}>
          {formatTime12(t)}
        </option>
      ))}
    </select>
  );
}

function CopyMenu({
  sourceDay,
  onApply,
}: {
  sourceDay: number;
  onApply: (targetDays: number[]) => void;
}) {
  const alignRight = sourceDay >= 4;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function toggle(day: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setSelected(new Set());
          setOpen((o) => !o);
        }}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-electric-blue rounded-md hover:bg-white transition-colors"
        aria-label={`Copy ${DAY_LABELS[sourceDay]} hours to other days`}
        title="Copy hours to other days"
      >
        <Copy className="w-3.5 h-3.5" />
        Copy
      </button>
      {open && (
        <div
          className={`absolute ${alignRight ? 'right-0' : 'left-0'} z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-3 shadow-lg`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Copy times to
          </p>
          <div className="space-y-1.5 mb-3">
            {DAY_LABELS.map((label, day) =>
              day === sourceDay ? null : (
                <label key={label} className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(day)}
                    onChange={() => toggle(day)}
                    className="h-4 w-4 accent-electric-blue"
                  />
                  {label}
                </label>
              )
            )}
          </div>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => {
              onApply([...selected]);
              setOpen(false);
            }}
            className="w-full px-3 py-1.5 text-sm font-semibold rounded-lg bg-electric-blue text-white hover:opacity-90 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

export default function AvailabilityEditor({ days, onChange, durationMinutes }: Props) {
  function updateDay(dayOfWeek: number, update: (day: DayAvailability) => DayAvailability) {
    onChange(days.map((d) => (d.dayOfWeek === dayOfWeek ? update(d) : d)));
  }

  function updateRange(dayOfWeek: number, key: string, patch: Partial<TimeRange>) {
    updateDay(dayOfWeek, (d) => ({
      ...d,
      ranges: d.ranges.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));
  }

  function addRange(dayOfWeek: number) {
    updateDay(dayOfWeek, (d) => {
      const last = [...d.ranges].sort((a, b) => a.endTime.localeCompare(b.endTime)).at(-1);
      const startTime = last ? last.endTime : DEFAULT_RANGE.startTime;
      const endTime = last ? addMinutes(startTime, 60) : DEFAULT_RANGE.endTime;
      return { ...d, ranges: [...d.ranges, { key: newRangeKey(), startTime, endTime }] };
    });
  }

  function removeRange(dayOfWeek: number, key: string) {
    updateDay(dayOfWeek, (d) => ({ ...d, ranges: d.ranges.filter((r) => r.key !== key) }));
  }

  function copyDay(sourceDay: number, targetDays: number[]) {
    const source = days[sourceDay];
    onChange(
      days.map((d) =>
        targetDays.includes(d.dayOfWeek)
          ? {
              ...d,
              ranges: source.ranges.map((r) => ({ ...r, key: newRangeKey() })),
            }
          : d
      )
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 py-4">
      {days.map((day) => {
        const errors = rangeErrors(day);
        const slotCount = slotCountForDay(day, durationMinutes);
        const hasRanges = day.ranges.length > 0;
        return (
          <div
            key={day.dayOfWeek}
            className={`flex flex-col rounded-lg border min-w-0 ${
              hasRanges ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-white'
            }`}
          >
            <div className="px-2.5 py-2 border-b border-gray-200 bg-white rounded-t-lg text-center">
              <div
                className={`text-sm font-semibold ${hasRanges ? 'text-gray-900' : 'text-gray-400'}`}
              >
                {DAY_LABELS[day.dayOfWeek].slice(0, 3)}
              </div>
              <div className="text-[11px] text-gray-500">
                {slotCount} {slotCount === 1 ? 'slot' : 'slots'}
              </div>
            </div>

            <div className="flex-1 p-2 space-y-2">
              {hasRanges ? (
                day.ranges.map((range) => (
                  <div
                    key={range.key}
                    className={`relative rounded-md border bg-white p-1.5 space-y-1 ${
                      errors[range.key] ? 'border-red-300' : 'border-gray-200'
                    }`}
                  >
                    <TimeSelect
                      value={range.startTime}
                      invalid={Boolean(errors[range.key])}
                      onChange={(startTime) => updateRange(day.dayOfWeek, range.key, { startTime })}
                      label={`${DAY_LABELS[day.dayOfWeek]} start time`}
                    />
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] text-gray-400">to</span>
                      <button
                        type="button"
                        onClick={() => removeRange(day.dayOfWeek, range.key)}
                        className="p-0.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                        aria-label="Remove time range"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <TimeSelect
                      value={range.endTime}
                      invalid={Boolean(errors[range.key])}
                      onChange={(endTime) => updateRange(day.dayOfWeek, range.key, { endTime })}
                      label={`${DAY_LABELS[day.dayOfWeek]} end time`}
                    />
                    {errors[range.key] && (
                      <p className="text-[11px] leading-tight text-red-600 px-1">{errors[range.key]}</p>
                    )}
                  </div>
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => addRange(day.dayOfWeek)}
                  className="w-full flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-gray-200 py-6 text-xs font-medium text-gray-500 hover:border-electric-blue hover:text-electric-blue transition-colors"
                  aria-label={`Add hours on ${DAY_LABELS[day.dayOfWeek]}`}
                >
                  <Plus className="w-4 h-4" />
                  Add hours
                </button>
              )}
            </div>

            {hasRanges && (
              <div className="flex items-center justify-between gap-1 px-1.5 pb-1.5">
                <button
                  type="button"
                  onClick={() => addRange(day.dayOfWeek)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-electric-blue rounded-md hover:bg-gray-100 transition-colors"
                  aria-label={`Add a time range on ${DAY_LABELS[day.dayOfWeek]}`}
                  title="Add a time range"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
                <CopyMenu
                  sourceDay={day.dayOfWeek}
                  onApply={(targets) => copyDay(day.dayOfWeek, targets)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
