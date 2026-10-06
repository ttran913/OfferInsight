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
  canEdit: boolean;
  durationMinutes: number;
};

function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + delta, 23 * 60 + 45);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-electric-blue' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function TimeSelect({
  value,
  disabled,
  invalid,
  onChange,
  label,
}: {
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
  label: string;
}) {
  const options = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [...TIME_OPTIONS, value].sort();
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={`w-32 px-3 py-2 bg-white border rounded-lg text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500 ${
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
        className="p-2 text-gray-400 hover:text-electric-blue rounded-lg hover:bg-gray-100 transition-colors"
        aria-label={`Copy ${DAY_LABELS[sourceDay]} hours to other days`}
        title="Copy hours to other days"
      >
        <Copy className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
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

export default function AvailabilityEditor({ days, onChange, canEdit, durationMinutes }: Props) {
  function updateDay(dayOfWeek: number, update: (day: DayAvailability) => DayAvailability) {
    onChange(days.map((d) => (d.dayOfWeek === dayOfWeek ? update(d) : d)));
  }

  function updateRange(dayOfWeek: number, key: string, patch: Partial<TimeRange>) {
    updateDay(dayOfWeek, (d) => ({
      ...d,
      ranges: d.ranges.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));
  }

  function toggleDay(dayOfWeek: number, enabled: boolean) {
    updateDay(dayOfWeek, (d) => ({
      ...d,
      enabled,
      ranges:
        enabled && d.ranges.length === 0 ? [{ key: newRangeKey(), ...DEFAULT_RANGE }] : d.ranges,
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
    updateDay(dayOfWeek, (d) => {
      const ranges = d.ranges.filter((r) => r.key !== key);
      return { ...d, ranges, enabled: ranges.length > 0 };
    });
  }

  function copyDay(sourceDay: number, targetDays: number[]) {
    const source = days[sourceDay];
    onChange(
      days.map((d) =>
        targetDays.includes(d.dayOfWeek)
          ? {
              ...d,
              enabled: true,
              ranges: source.ranges.map((r) => ({ ...r, key: newRangeKey() })),
            }
          : d
      )
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {days.map((day) => {
        const errors = rangeErrors(day);
        const slotCount = slotCountForDay(day, durationMinutes);
        return (
          <div
            key={day.dayOfWeek}
            className="flex flex-col sm:flex-row sm:items-start gap-3 py-4"
          >
            <div className="flex items-center gap-3 sm:w-44 shrink-0 sm:pt-1.5">
              <Switch
                checked={day.enabled}
                disabled={!canEdit}
                onChange={(next) => toggleDay(day.dayOfWeek, next)}
                label={`${DAY_LABELS[day.dayOfWeek]} available`}
              />
              <span
                className={`font-semibold ${day.enabled ? 'text-gray-900' : 'text-gray-400'}`}
              >
                {DAY_LABELS[day.dayOfWeek]}
              </span>
            </div>

            <div className="flex-1 space-y-2">
              {day.enabled ? (
                day.ranges.map((range, index) => (
                  <div key={range.key}>
                    <div className="flex flex-wrap items-center gap-2">
                      <TimeSelect
                        value={range.startTime}
                        disabled={!canEdit}
                        invalid={Boolean(errors[range.key])}
                        onChange={(startTime) => updateRange(day.dayOfWeek, range.key, { startTime })}
                        label={`${DAY_LABELS[day.dayOfWeek]} start time`}
                      />
                      <span className="text-gray-400">–</span>
                      <TimeSelect
                        value={range.endTime}
                        disabled={!canEdit}
                        invalid={Boolean(errors[range.key])}
                        onChange={(endTime) => updateRange(day.dayOfWeek, range.key, { endTime })}
                        label={`${DAY_LABELS[day.dayOfWeek]} end time`}
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeRange(day.dayOfWeek, range.key)}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100 transition-colors"
                          aria-label="Remove time range"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      {canEdit && index === 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => addRange(day.dayOfWeek)}
                            className="p-2 text-gray-400 hover:text-electric-blue rounded-lg hover:bg-gray-100 transition-colors"
                            aria-label={`Add another range on ${DAY_LABELS[day.dayOfWeek]}`}
                            title="Add another range"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <CopyMenu
                            sourceDay={day.dayOfWeek}
                            onApply={(targets) => copyDay(day.dayOfWeek, targets)}
                          />
                        </>
                      )}
                    </div>
                    {errors[range.key] && (
                      <p className="text-xs text-red-600 mt-1">{errors[range.key]}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400 sm:pt-2">Unavailable</p>
              )}
            </div>

            {day.enabled && (
              <div className="text-xs text-gray-500 sm:w-20 sm:text-right sm:pt-2.5 shrink-0">
                {slotCount} {slotCount === 1 ? 'slot' : 'slots'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
