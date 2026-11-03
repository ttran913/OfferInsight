import type { Metadata } from 'next';
import { LegalDoc, LegalSection } from '@/components/legal-doc';

export const metadata: Metadata = {
  title: 'Privacy Policy | Open Source Resume',
  description:
    'How Open Source Resume collects, uses, stores, and shares personal data, including Google Calendar data.',
};

const EFFECTIVE_DATE = 'November 2, 2026';

export default function PrivacyPolicyPage() {
  return (
    <LegalDoc title="Privacy Policy" effectiveDate={EFFECTIVE_DATE}>
      <p>
        Open Source Resume (&quot;Open Source Resume,&quot; &quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;) operates the website at{' '}
        <a
          href="https://www.opensourceresume.org"
          className="text-electric-blue hover:underline"
        >
          www.opensourceresume.org
        </a>{' '}
        (the &quot;Service&quot;). This Privacy Policy explains what information we collect, how we
        use it, and the choices you have. By using the Service, you agree to this policy.
      </p>
      <p>
        Questions about privacy: contact{' '}
        <a href="mailto:usaha@csumb.edu" className="text-electric-blue hover:underline">
          usaha@csumb.edu
        </a>
        .
      </p>

      <LegalSection title="1. Who this policy covers">
        <p>
          The Service is available to the public. It is used by job-seeking candidates (students and
          other users), instructors or mentors who help candidates, and visitors who browse the
          site without signing in.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>
          <strong>Account and profile information.</strong> When you create an account (typically
          by signing in with GitHub), we may collect your name, email address, profile image, and
          GitHub account identifiers. You may also provide school, major, expected graduation date,
          LeetCode username, career goals, and similar profile details.
        </p>
        <p>
          <strong>Activity you enter in the Service.</strong> This can include job applications and
          outreach notes, networking contacts and notes, open-source progress and related links or
          responses, partnership selections, and monthly meeting booking details.
        </p>
        <p>
          <strong>Instructor accounts.</strong> Instructors sign in with credentials we issue.
          Instructors may set a display name, contact email, meeting location details, and weekly
          availability windows used for student booking.
        </p>
        <p>
          <strong>Google Calendar information (instructors who choose to connect).</strong> If an
          instructor connects Google Calendar, we receive and process Google user data as described
          in Section 3.
        </p>
        <p>
          <strong>Communications.</strong> We may send transactional emails related to the Service
          (for example, meeting confirmations, calendar invites, inactivity notices, or booking
          reminders) to the email address associated with your account.
        </p>
        <p>
          <strong>Technical data.</strong> Like most websites, we automatically receive standard
          technical information such as IP address, browser type, device information, and pages
          visited. We use session cookies and similar technologies needed to keep you signed in and
          operate the Service. We do not use advertising cookies to track you across other sites.
        </p>
      </LegalSection>

      <LegalSection title="3. Google user data">
        <p>
          Some instructors may connect their Google account so Open Source Resume can sync monthly
          1:1 meetings with Google Calendar. This connection is optional and initiated by the
          instructor.
        </p>
        <p>
          <strong>Google data we access.</strong> With the instructor&apos;s consent, we request:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <code className="rounded bg-gray-100 px-1 text-sm">
              https://www.googleapis.com/auth/calendar.events
            </code>{' '}
            — to read calendar events on the instructor&apos;s primary calendar (so we can show
            busy times and avoid double-booking), and to create, update, and delete calendar events
            for Open Source Resume monthly 1:1 meetings.
          </li>
          <li>
            <code className="rounded bg-gray-100 px-1 text-sm">
              https://www.googleapis.com/auth/userinfo.email
            </code>{' '}
            — to identify the Google account that was connected.
          </li>
        </ul>
        <p>
          <strong>How we use Google user data.</strong> We use this data only to provide the
          instructor-facing calendar connection and student meeting-scheduling features in the
          Service: checking availability, creating recurring monthly meeting events, moving or
          canceling those meetings, and displaying connection status (including the connected Google
          email).
        </p>
        <p>
          <strong>How we store Google user data.</strong> We store OAuth access and refresh tokens
          in encrypted form in our database, along with the connected Google email address and
          related connection metadata (such as token expiry and granted scopes). Meeting records in
          our database may include Google Calendar event IDs needed to update or remove those
          events. We do not download or permanently store the full contents of an instructor&apos;s
          calendar beyond what is needed to operate scheduling in the Service.
        </p>
        <p>
          <strong>Sharing of Google user data.</strong> We do not sell Google user data. We do not
          share Google user data with third parties for advertising, marketing, or data brokerage.
          Limited technical processing may occur through our infrastructure providers (for example,
          hosting and database services) solely to operate the Service, under obligations to protect
          the data.
        </p>
        <p>
          <strong>Google API Services User Data Policy / Limited Use.</strong> Open Source
          Resume&apos;s use and transfer to any other app of information received from Google APIs
          will adhere to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-electric-blue hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            We use Google user data only to provide or improve user-facing features that are
            prominent in the Service (calendar sync and meeting scheduling).
          </li>
          <li>
            We do not use Google user data for serving advertisements, personalized ads, or
            credit-worthiness decisions.
          </li>
          <li>
            We do not sell Google user data or transfer it except as needed to provide the Service
            with user consent, for security, to comply with law, or as part of a merger or sale
            after obtaining required consent.
          </li>
          <li>
            We do not use Google user data to train generalized artificial intelligence or machine
            learning models.
          </li>
          <li>
            Human access to Google user data is limited to cases such as user-requested support
            with consent, security investigations, or legal compliance.
          </li>
        </ul>
        <p>
          <strong>Disconnecting Google.</strong> Instructors can disconnect Google Calendar from
          the instructor dashboard. After disconnect, we stop using that Google account for new
          calendar operations and remove or invalidate stored Google OAuth tokens associated with
          the connection. Instructors can also revoke access at{' '}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-electric-blue hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Account permissions
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="4. How we use information (generally)">
        <p>We use personal information to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Provide, maintain, and improve the Service</li>
          <li>Authenticate users and secure accounts</li>
          <li>Track candidate progress, applications, networking, and open-source work</li>
          <li>Schedule and manage monthly meetings between candidates and instructors</li>
          <li>Send service-related emails and notifications</li>
          <li>Respond to support requests and enforce our Terms of Service</li>
          <li>Comply with legal obligations</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. How we share information">
        <p>We may share information in these situations:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Within the Service.</strong> Instructors and authorized mentors may see
            candidate progress and meeting information needed to coach users. Meeting details may
            appear on an instructor&apos;s connected Google Calendar.
          </li>
          <li>
            <strong>Service providers.</strong> Vendors that host our application, database, or
            email delivery may process data on our behalf to run the Service.
          </li>
          <li>
            <strong>Legal and safety.</strong> If required by law, or to protect rights, safety, or
            the integrity of the Service.
          </li>
          <li>
            <strong>Business transfers.</strong> If we are involved in a merger, acquisition, or
            asset sale, information may be transferred subject to this policy and applicable
            consent requirements (including for Google user data).
          </li>
        </ul>
        <p>We do not sell personal information.</p>
      </LegalSection>

      <LegalSection title="6. Data retention">
        <p>
          We retain account and activity data for as long as your account remains active or as
          needed to provide the Service, resolve disputes, and meet legal requirements. Meeting and
          calendar-related records are kept while needed for scheduling history and operations.
          Encrypted Google OAuth tokens are retained only while an instructor&apos;s Google Calendar
          remains connected (or briefly thereafter while cleanup completes).
        </p>
      </LegalSection>

      <LegalSection title="7. Your choices and rights">
        <p>
          You may update certain profile information in your account settings. You may request
          access to, correction of, or deletion of your personal information by emailing{' '}
          <a href="mailto:usaha@csumb.edu" className="text-electric-blue hover:underline">
            usaha@csumb.edu
          </a>
          . We will respond within a reasonable time. California residents may have additional
          rights under the CCPA/CPRA; to exercise them, contact us at the same email. We do not sell
          personal information, and we do not share it for cross-context behavioral advertising.
        </p>
      </LegalSection>

      <LegalSection title="8. Security">
        <p>
          We use reasonable administrative and technical safeguards, including encrypted storage of
          Google OAuth tokens and access controls for instructor and user accounts. No method of
          transmission or storage is completely secure, and we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection title="9. Children">
        <p>
          The Service is not directed to children under 13, and we do not knowingly collect
          personal information from children under 13. If you believe a child has provided us
          information, contact us and we will take appropriate steps to delete it.
        </p>
      </LegalSection>

      <LegalSection title="10. International users">
        <p>
          The Service is operated from the United States. If you access it from another country,
          your information may be processed in the United States, where laws may differ from those
          in your jurisdiction.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. We will post the updated version on
          this page and revise the effective date. If we change how we use Google user data in a
          material way, we will provide notice and obtain any consent required before using that
          data for the new purpose.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          Open Source Resume
          <br />
          California, United States
          <br />
          Email:{' '}
          <a href="mailto:usaha@csumb.edu" className="text-electric-blue hover:underline">
            usaha@csumb.edu
          </a>
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
