import { AlertTriangle } from 'lucide-react';
import type { MustBookReason } from '@/app/lib/must-book';

/** The student's "book a monthly 1:1" clock, as returned by GET /api/calendar/meeting. */
export type MustBookNotice = {
  reason: MustBookReason;
  missedLabel: string | null;
  /** Book-by before the final warning, removal time after it */
  deadlineLabel: string;
  finalWarningSent: boolean;
};

export default function MustBookAlert({
  notice,
  instructorView = false,
}: {
  notice: MustBookNotice;
  instructorView?: boolean;
}) {
  const missed = notice.reason === 'missedMeeting' && notice.missedLabel;
  const lead = instructorView
    ? missed
      ? `This student missed their 1:1 on ${notice.missedLabel}, so their monthly schedule was cleared.`
      : "This student hasn't scheduled their monthly 1:1."
    : missed
      ? `You missed your 1:1 on ${notice.missedLabel}, so your monthly schedule was cleared.`
      : "You haven't scheduled your monthly 1:1 yet.";
  const consequence = instructorView
    ? "or they'll be removed from the Resume Book."
    : "or you'll be removed from the Resume Book.";

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          {notice.finalWarningSent && <span className="font-semibold">Final warning: </span>}
          {lead} Monthly 1:1s are <span className="font-semibold">mandatory</span>. Book a new
          monthly meeting by <span className="font-semibold">{notice.deadlineLabel}</span>{' '}
          {consequence}
        </p>
      </div>
    </div>
  );
}
