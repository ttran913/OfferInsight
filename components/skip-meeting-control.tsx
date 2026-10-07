"use client"

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SKIP_REASON_MAX_LENGTH } from '@/app/lib/calendar/skips';
import { ModalOverlay, ModalPanel } from '@/app/dashboard/components/shared';
import type { MeetingSummary } from '@/components/monthly-meeting-scheduler';

type SkipMeetingControlProps = {
  meeting: MeetingSummary;
  instructorName: string;
  onChange: (meeting: MeetingSummary) => void;
  /** Instructors viewing a student's dashboard see the skip but can't change it. */
  readOnly?: boolean;
};

/** One-time skip of the next meeting (and undo), leaving the monthly series as is. */
export default function SkipMeetingControl({
  meeting,
  instructorName,
  onChange,
  readOnly = false,
}: SkipMeetingControlProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(method: 'POST' | 'DELETE') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/calendar/meeting/skip', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ reason }) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setModalOpen(false);
      setReason('');
      onChange(data.meeting);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const skipped = meeting.skippedOccurrence;

  if (skipped) {
    return (
      <div className="text-sm text-gray-600 mt-1">
        Skipping <span className="line-through">{skipped.label}</span>
        {!readOnly && (
          <>
            {' · '}
            <button
              type="button"
              onClick={() => submit('DELETE')}
              disabled={busy}
              className="font-semibold text-electric-blue hover:underline disabled:opacity-50"
            >
              {busy ? 'Undoing…' : 'Undo'}
            </button>
          </>
        )}
        {readOnly && skipped.reason && (
          <span className="text-gray-500"> ({skipped.reason})</span>
        )}
        {error && <p className="text-red-700 mt-1">{error}</p>}
      </div>
    );
  }

  if (readOnly || !meeting.nextOccurrenceLabel) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setModalOpen(true);
        }}
        className="mt-1 text-sm text-gray-500 hover:text-gray-800 hover:underline underline-offset-2"
      >
        Can&apos;t make it? Skip this meeting
      </button>

      {modalOpen && (
        <ModalOverlay onClose={() => !busy && setModalOpen(false)}>
          <ModalPanel size="md">
            <h3 className="text-lg font-semibold text-gray-900">Skip this meeting?</h3>
            <p className="text-sm text-gray-700 mt-2">
              You won&apos;t meet with {instructorName} on{' '}
              <span className="font-semibold text-gray-900">{meeting.nextOccurrenceLabel}</span>.
              Your monthly schedule stays the same
              {meeting.followingOccurrenceLabel ? (
                <>
                  , and your next meeting will be{' '}
                  <span className="font-semibold text-gray-900">
                    {meeting.followingOccurrenceLabel}
                  </span>
                </>
              ) : null}
              .
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {instructorName} will be notified. You can undo this until the meeting starts.
            </p>

            <label className="block mt-4 text-sm font-medium text-gray-700" htmlFor="skip-reason">
              Reason <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              id="skip-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={SKIP_REASON_MAX_LENGTH}
              rows={3}
              placeholder="e.g. Feeling sick, family obligation…"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-electric-blue focus:outline-none focus:ring-1 focus:ring-electric-blue"
            />

            {error && <p className="text-sm text-red-700 mt-2">{error}</p>}

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={busy}
                className="px-4 py-2 rounded-lg font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => submit('POST')}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Skip meeting
              </button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}
    </>
  );
}
