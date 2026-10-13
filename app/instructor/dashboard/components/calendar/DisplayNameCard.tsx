"use client"

import { useState } from 'react';
import { Loader2, UserRound } from 'lucide-react';
import {
  INSTRUCTOR_DISPLAY_NAME_FALLBACK,
  INSTRUCTOR_DISPLAY_NAME_MAX_LENGTH,
} from '@/app/lib/calendar/constants';

type DefaultSchedulerState = {
  isDefaultScheduler: boolean;
  defaultInstructorLabel: string | null;
  isDefaultInstructor: boolean;
};

type Props = {
  initialName: string;
  canManageDefault: boolean;
  initialDefault: DefaultSchedulerState;
};

export default function DisplayNameCard({ initialName, canManageDefault, initialDefault }: Props) {
  const [savedName, setSavedName] = useState(initialName);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [defaultState, setDefaultState] = useState(initialDefault);
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultError, setDefaultError] = useState<string | null>(null);

  async function handleDefaultChange(checked: boolean) {
    setSavingDefault(true);
    setDefaultError(null);
    try {
      const res = await fetch('/api/instructor/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefaultScheduler: checked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update default instructor');
      setDefaultState({
        isDefaultScheduler: data.isDefaultScheduler,
        defaultInstructorLabel: data.defaultInstructorLabel,
        isDefaultInstructor: data.isDefaultInstructor,
      });
    } catch (err) {
      setDefaultError(err instanceof Error ? err.message : 'Failed to update default instructor');
    } finally {
      setSavingDefault(false);
    }
  }

  const defaultHint = defaultState.isDefaultScheduler
    ? 'Students without an assigned instructor book with you.'
    : defaultState.isDefaultInstructor
    ? 'You are currently the default automatically. Check to keep it that way.'
    : defaultState.defaultInstructorLabel
    ? `Currently: ${defaultState.defaultInstructorLabel}.`
    : null;

  const normalized = name.trim().replace(/\s+/g, ' ');
  const unchanged = normalized === savedName;
  const preview = normalized || INSTRUCTOR_DISPLAY_NAME_FALLBACK;

  async function handleSave() {
    if (unchanged) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/instructor/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: normalized }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save display name');
      setSavedName(data.displayName);
      setName(data.displayName);
      setFeedback({ kind: 'ok', text: 'Display name saved.' });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to save display name',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-gray-200 rounded-lg bg-white px-5 py-4">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-start gap-3 md:w-72 shrink-0">
          <UserRound className="w-6 h-6 text-electric-blue shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Display name</h2>
            <p className="text-sm text-gray-500">How students see you on their dashboard.</p>
          </div>
        </div>

        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFeedback(null);
              }}
              maxLength={INSTRUCTOR_DISPLAY_NAME_MAX_LENGTH}
              placeholder="e.g. John Doe"
              aria-label="Display name"
              className="flex-1 min-w-0 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            <button
              type="submit"
              disabled={unchanged || saving}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-electric-blue text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            Students see:{' '}
            <span className="font-medium text-gray-700">
              &ldquo;Monthly meeting with {preview}&rdquo;
            </span>
            {feedback && (
              <span
                className={`ml-2 font-medium ${
                  feedback.kind === 'ok' ? 'text-green-700' : 'text-red-600'
                }`}
              >
                {feedback.text}
              </span>
            )}
          </p>
          {canManageDefault && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={defaultState.isDefaultScheduler}
                  onChange={(e) => handleDefaultChange(e.target.checked)}
                  disabled={savingDefault}
                  className="w-4 h-4 accent-electric-blue"
                />
                Default instructor for unassigned students
                {savingDefault && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
              </label>
              {(defaultHint || defaultError) && (
                <p className={`text-xs mt-1 ${defaultError ? 'text-red-600' : 'text-gray-500'}`}>
                  {defaultError || defaultHint}
                </p>
              )}
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
