import nodemailer from "nodemailer";
import { appUrl, emailButton, emailCallout, emailLayout, escapeHtml } from "@/app/lib/email-layout";
import type { MustBookReason } from "@/app/lib/must-book";

const transporter = nodemailer.createTransport(process.env.EMAIL_SERVER);

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

type BuiltEmail = { subject: string; text: string; html: string };

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments,
}: SendEmailOptions): Promise<void> {
  if (!process.env.EMAIL_SERVER || !process.env.EMAIL_FROM) {
    throw new Error("EMAIL_SERVER and EMAIL_FROM environment variables must be set");
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html: html || text,
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || "application/octet-stream",
    })),
  });
}

export function buildInactivityWarningEmail(userName: string | null): BuiltEmail {
  const name = userName || "there";
  const subject = "[Resume Book] Reminder - Update your Open Source Progress";
  
  const text = `Hi ${name},

We noticed you haven't updated your open source progress on the the <a href="opensourceresumebook.com">tracking website</a> in over 30 days.

Please update the Open Source board on the website by the end of the day.  Consider dragging at least one card to the next column. 



Best,
The Resume Book Team`;

  const html = emailLayout({
    heading: "Reminder: Update your Open Source board",
    bodyHtml: `<p>Hi ${name},</p>
  
  <p>We noticed you haven't updated your open source progress on the the <a href="opensourceresumebook.com">tracking website</a> in over 30 days.</p>
  
  <p>Please update the Open Source board on the website by the end of the day.  Consider dragging at least one card to the next column. </p>
  
  
  <p>Best,<br>The Resume Book Team</p>`,
  });

  return { subject, text, html };
}

export function buildSecondWarningEmail(userName: string | null): BuiltEmail {
  const name = userName || "there";
  const subject = "[Resume Book] Action Required to Remain in Resume Book";
  
  const text = `Hi ${name},

This is your second notice. You still haven't updated your Open Source board in over 5 weeks.

If you do not update your progress within the next 7 days, you will be removed from the Resume Book.

Please log in to opensourceresumebook.com and update your Open Source board today.

Best,
The Resume Book Team`;

  const html = emailLayout({
    heading: " Action Required to Remain in Resume Book",
    headingColor: "#dc2626",
    bodyHtml: `<p>Hi ${name},</p>
  
  <p>This is your <strong>second notice</strong>. You still haven't updated your Open Source board in over 5 weeks.</p>
  
  ${emailCallout("<strong>If you do not update your progress within the next 7 days, you will be REMOVED from the Resume Book.</strong>")}
   
  <p><strong>Please log in to <a href="https://opensourceresumebook.com">opensourceresumebook.com</a> and update your Open Source board today.</strong></p>
  
  <p>Best,<br>The Resume Book Team</p>`,
  });

  return { subject, text, html };
}

export type RemovalReason = "inactivity" | MustBookReason;

const REMOVAL_REASON_TEXT: Record<RemovalReason, string> = {
  inactivity: `Since you have not updated your Open Source board in over 6 weeks, we are assuming that you are no longer 
active in the resume book.  Therefore, we are removing you from the roster.`,
  missedMeeting:
    "Since you missed your required monthly 1:1 and did not book a new one within 4 days, we are removing you from the roster.",
  skippedOnboarding:
    "Since you did not schedule your required monthly 1:1 within 4 days, we are removing you from the roster.",
};

export function buildRemovalNoticeEmail(
  userName: string | null,
  reason: RemovalReason = "inactivity"
): BuiltEmail {
  const name = userName || "there";
  const subject = "[Resume Book] You Have Been Removed from the Resume Book";
  const why = REMOVAL_REASON_TEXT[reason];
  
  const text = `Hi ${name},

${why}


If you believe this was a mistake or would like to be reinstated, please contact Utsab directly.

Best,
The Resume Book Team`;

  const html = emailLayout({
    heading: "You Have Been Removed from the Resume Book",
    headingColor: "#dc2626",
    bodyHtml: `<p>Hi ${name},</p>
  
  <p>${why}
</p>
  
  
  <p>If you believe this was a mistake or would like to be reinstated, please contact Utsab.</p>
  
  <p>Best,<br>The Resume Book Team</p>`,
  });

  return { subject, text, html };
}

const BOOKING_CONSEQUENCE =
  "If you haven't booked by then, we'll send a final warning. If there's still no meeting 24 hours after that, you'll be removed from the Resume Book.";

/** To a student who skipped booking their monthly 1:1; starts the 72h/96h clock. */
export function buildSkippedBookingEmail(input: {
  studentName: string | null;
  /** e.g. "Saturday, October 17 at 2:15 PM PDT" */
  bookByLabel: string;
}): BuiltEmail {
  const name = input.studentName || "there";
  const bookUrl = appUrl("/account");
  const subject = "[Resume Book] Schedule your required monthly 1:1";
  const lead =
    "Monthly 1:1s are mandatory for everyone in the Resume Book, and you haven't scheduled yours yet.";
  const deadline = `Please book a monthly 1:1 by ${input.bookByLabel} (within 72 hours).`;

  const text = `Hi ${name},

${lead}

${deadline}${bookUrl ? `\n${bookUrl}` : ""}

${BOOKING_CONSEQUENCE}

Best,
The Resume Book Team`;

  const html = emailLayout({
    heading: "Schedule your required monthly 1:1",
    bodyHtml: `<p>Hi ${escapeHtml(name)},</p>
  <p>${escapeHtml(lead)}</p>
  ${emailCallout(`<strong>${escapeHtml(deadline)}</strong>`)}
  ${bookUrl ? emailButton(bookUrl, "Book my 1:1") : ""}
  <p>${escapeHtml(BOOKING_CONSEQUENCE)}</p>
  <p>Best,<br>The Resume Book Team</p>`,
  });

  return { subject, text, html };
}

/** To a student an instructor marked as having missed their 1:1; their schedule was cleared. */
export function buildMissedMeetingEmail(input: {
  studentName: string | null;
  instructorName: string;
  /** e.g. "Wednesday, October 14, 2026 at 10:00 AM PDT" */
  missedLabel: string;
  bookByLabel: string;
}): BuiltEmail {
  const name = input.studentName || "there";
  const bookUrl = appUrl("/account");
  const subject = `You missed your 1:1 with ${input.instructorName}. Please book a new time`;
  const lead = `Our records show you missed your monthly 1:1 with ${input.instructorName} on ${input.missedLabel}.`;
  const cleared =
    "Monthly 1:1s are required, so your meeting schedule has been cleared. The attached calendar file removes it from your calendar.";
  const deadline = `Please book a new monthly 1:1 by ${input.bookByLabel} (within 72 hours).`;

  const text = `Hi ${name},

${lead}

${cleared}

${deadline}${bookUrl ? `\n${bookUrl}` : ""}

${BOOKING_CONSEQUENCE}

Best,
The Resume Book Team`;

  const html = emailLayout({
    heading: `You missed your 1:1 with ${escapeHtml(input.instructorName)}`,
    bodyHtml: `<p>Hi ${escapeHtml(name)},</p>
  <p>${escapeHtml(lead)}</p>
  <p>${escapeHtml(cleared)}</p>
  ${emailCallout(`<strong>${escapeHtml(deadline)}</strong>`)}
  ${bookUrl ? emailButton(bookUrl, "Book my 1:1") : ""}
  <p>${escapeHtml(BOOKING_CONSEQUENCE)}</p>
  <p>Best,<br>The Resume Book Team</p>`,
  });

  return { subject, text, html };
}

/** Sent 72 hours into the clock: 24 hours left to book before removal. */
export function buildBookingFinalWarningEmail(input: {
  studentName: string | null;
  reason: MustBookReason;
  instructorName: string;
  /** The missed meeting, for reason "missedMeeting" */
  missedLabel: string | null;
  /** When removal happens if they still haven't booked */
  removeByLabel: string;
}): BuiltEmail {
  const name = input.studentName || "there";
  const bookUrl = appUrl("/account");
  const subject = "[Resume Book] Final warning: book your 1:1 within 24 hours";
  const lead =
    input.reason === "missedMeeting" && input.missedLabel
      ? `You missed your 1:1 with ${input.instructorName} on ${input.missedLabel}, and you haven't booked a new monthly meeting yet.`
      : "You still haven't scheduled your required monthly 1:1. Monthly 1:1s are mandatory for everyone in the Resume Book.";
  const deadline = `This is your final warning. Book a new monthly 1:1 by ${input.removeByLabel}, or you will be removed from the Resume Book.`;
  const easy =
    "It only takes a minute: pick any open day and time, and it becomes your regular monthly meeting.";

  const text = `Hi ${name},

${lead}

${deadline}${bookUrl ? `\n${bookUrl}` : ""}

${easy}

Best,
The Resume Book Team`;

  const html = emailLayout({
    heading: "Final warning: book your 1:1 within 24 hours",
    headingColor: "#dc2626",
    bodyHtml: `<p>Hi ${escapeHtml(name)},</p>
  <p>${escapeHtml(lead)}</p>
  ${emailCallout(`<strong>${escapeHtml(deadline)}</strong>`)}
  ${bookUrl ? emailButton(bookUrl, "Book my 1:1 now") : ""}
  <p>${escapeHtml(easy)}</p>
  <p>Best,<br>The Resume Book Team</p>`,
  });

  return { subject, text, html };
}