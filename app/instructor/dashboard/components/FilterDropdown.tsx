"use client"

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface FilterOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
  dotClass?: string;
  count: number;
}

export default function FilterDropdown<T extends string | number>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Picking every option filters nothing, so it reads the same as picking none
  const isFiltering = selected.length > 0 && selected.length < options.length;
  const summary = isFiltering
    ? `${label}: ${options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(', ')}`
    : label;

  function toggle(value: T) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border whitespace-nowrap transition-colors focus:outline-none focus:ring-1 focus:ring-electric-blue ${
          isFiltering
            ? 'bg-white border-electric-blue text-gray-900 font-medium'
            : 'bg-gray-100 border-gray-300 text-gray-900 hover:bg-gray-200'
        }`}
      >
        {summary}
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
                className="mt-1 h-4 w-4 accent-electric-blue"
              />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                  {option.dotClass && <span className={`w-3 h-3 rounded-full ${option.dotClass}`} />}
                  {option.label}
                  <span className="ml-auto text-xs font-normal text-gray-500">{option.count}</span>
                </span>
                {option.description && (
                  <span className="block text-xs text-gray-500">{option.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
