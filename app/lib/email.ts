import nodemailer from "nodemailer";

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

export function buildInactivityWarningEmail(userName: string | null): { subject: string; text: string; html: string } {
  const name = userName || "there";
  const subject = "[Resume Book] Reminder - Update your Open Source Progress";
  
  const text = `Hi ${name},

We noticed you haven't updated your open source progress on the the <a href="opensourceresumebook.com">tracking website</a> in over 30 days.

Please update the Open Source board on the website by the end of the day.  Consider dragging at least one card to the next column. 



Best,
The Resume Book Team`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #007ACC;">Reminder: Update your Open Source board</h2>
  
  <p>Hi ${name},</p>
  
  <p>We noticed you haven't updated your open source progress on the the <a href="opensourceresumebook.com">tracking website</a> in over 30 days.</p>
  
  <p>Please update the Open Source board on the website by the end of the day.  Consider dragging at least one card to the next column. </p>
  
  
  <p>Best,<br>The Resume Book Team</p>
</body>
</html>`;

  return { subject, text, html };
}

export function buildSecondWarningEmail(userName: string | null): { subject: string; text: string; html: string } {
  const name = userName || "there";
  const subject = "[Resume Book] Action Required to Remain in Resume Book";
  
  const text = `Hi ${name},

This is your second notice. You still haven't updated your Open Source board in over 5 weeks.

If you do not update your progress within the next 7 days, you will be removed from the Resume Book.

Please log in to opensourceresumebook.com and update your Open Source board today.

Best,
The Resume Book Team`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc2626;"> Action Required to Remain in Resume Book</h2>
  
  <p>Hi ${name},</p>
  
  <p>This is your <strong>second notice</strong>. You still haven't updated your Open Source board in over 5 weeks.</p>
  
  <p style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 16px 0;">
    <strong>If you do not update your progress within the next 7 days, you will be REMOVED from the Resume Book.</strong>
  </p>
   
  <p><strong>Please log in to <a href="https://opensourceresumebook.com">opensourceresumebook.com</a> and update your Open Source board today.</strong></p>
  
  <p>Best,<br>The Resume Book Team</p>
</body>
</html>`;

  return { subject, text, html };
}

export function buildRemovalNoticeEmail(userName: string | null): { subject: string; text: string; html: string } {
  const name = userName || "there";
  const subject = "[Resume Book] You Have Been Removed from the Resume Book";
  
  const text = `Hi ${name},

Since you have not updated your Open Source board in over 6 weeks, we are assuming that you are no longer 
active in the resume book.  Therefore, we are removing you from the roster.


If you believe this was a mistake or would like to be reinstated, please contact Utsab directly.

Best,
The Resume Book Team`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc2626;">You Have Been Removed from the Resume Book</h2>
  
  <p>Hi ${name},</p>
  
  <p>Since you have not updated your Open Source board in over 6 weeks, we are assuming that you are no longer 
active in the resume book.  Therefore, we are removing you from the roster.
</p>
  
  
  <p>If you believe this was a mistake or would like to be reinstated, please contact Utsab.</p>
  
  <p>Best,<br>The Resume Book Team</p>
</body>
</html>`;

  return { subject, text, html };
}
