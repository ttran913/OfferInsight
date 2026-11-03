import type { Metadata } from 'next';
import { LegalDoc, LegalSection } from '@/components/legal-doc';

export const metadata: Metadata = {
  title: 'Terms of Service | Open Source Resume',
  description: 'Terms of Service for using Open Source Resume at www.opensourceresume.org.',
};

const EFFECTIVE_DATE = 'November 2, 2026';

export default function TermsOfServicePage() {
  return (
    <LegalDoc title="Terms of Service" effectiveDate={EFFECTIVE_DATE}>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of Open Source
        Resume at{' '}
        <a
          href="https://www.opensourceresume.org"
          className="text-electric-blue hover:underline"
        >
          www.opensourceresume.org
        </a>{' '}
        (the &quot;Service&quot;). By accessing or using the Service, you agree to these Terms. If
        you do not agree, do not use the Service.
      </p>
      <p>
        Contact:{' '}
        <a href="mailto:usaha@csumb.edu" className="text-electric-blue hover:underline">
          usaha@csumb.edu
        </a>
        .
      </p>

      <LegalSection title="1. The Service">
        <p>
          Open Source Resume helps candidates build and track open-source and career progress toward
          hiring-manager-defined benchmarks. Features may include progress tracking, application and
          networking boards, onboarding, instructor coaching tools, and scheduling of monthly
          meetings. We may change, suspend, or discontinue features at any time.
        </p>
      </LegalSection>

      <LegalSection title="2. Eligibility and accounts">
        <p>
          You must be able to form a binding contract under applicable law to use the Service. The
          Service is not intended for children under 13.
        </p>
        <p>
          You are responsible for your account credentials and for activity under your account.
          Candidate accounts typically authenticate through a third-party provider such as GitHub.
          Instructor accounts use credentials we provide. Keep your login information confidential
          and notify us promptly of unauthorized use.
        </p>
        <p>
          You agree to provide accurate information and to keep your profile reasonably up to date.
        </p>
      </LegalSection>

      <LegalSection title="3. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Use the Service for unlawful, harmful, or fraudulent purposes</li>
          <li>Harass, abuse, or mislead other users, instructors, or partners</li>
          <li>Upload malware or attempt to disrupt or reverse engineer the Service</li>
          <li>Access another user&apos;s account or data without authorization</li>
          <li>
            Misrepresent your identity, achievements, applications, or open-source contributions
          </li>
          <li>
            Use automated scraping or bulk extraction of the Service except as expressly allowed by
            us
          </li>
          <li>Interfere with Google Calendar or other integrations in abusive ways</li>
        </ul>
        <p>We may suspend or terminate accounts that violate these Terms.</p>
      </LegalSection>

      <LegalSection title="4. User content">
        <p>
          You retain ownership of content you submit (for example, notes, links, and progress
          entries). You grant Open Source Resume a non-exclusive, worldwide, royalty-free license to
          host, store, display, and process that content as needed to operate and improve the
          Service.
        </p>
        <p>
          You represent that you have the rights to submit the content you provide and that it does
          not infringe others&apos; rights.
        </p>
      </LegalSection>

      <LegalSection title="5. Third-party services">
        <p>
          The Service may integrate with third parties such as GitHub (sign-in) and Google Calendar
          (optional instructor calendar sync). Your use of those services is also subject to their
          terms and privacy policies. We are not responsible for third-party services we do not
          control.
        </p>
        <p>
          If an instructor connects Google Calendar, Google user data is handled as described in our{' '}
          <a href="/privacy" className="text-electric-blue hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="6. Mentorship and career outcomes">
        <p>
          Open Source Resume provides tools, pathways, and coaching-related features. We do not
          guarantee interviews, job offers, internships, or any particular career outcome. Advice
          and benchmarks shared through the Service are educational and informational, not
          professional, legal, or employment advice.
        </p>
      </LegalSection>

      <LegalSection title="7. Intellectual property">
        <p>
          The Service, including its design, software, branding, and original content (excluding
          user content), is owned by Open Source Resume or its licensors and is protected by
          intellectual property laws. You may not copy, modify, or distribute our materials except
          with our prior written permission or as allowed by law.
        </p>
      </LegalSection>

      <LegalSection title="8. Disclaimers">
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES
          OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
          UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, OPEN SOURCE RESUME AND ITS OPERATORS WILL NOT BE
          LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY
          LOSS OF PROFITS, DATA, OR OPPORTUNITIES, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL
          LIABILITY FOR ANY CLAIM ARISING OUT OF THESE TERMS OR THE SERVICE WILL NOT EXCEED ONE
          HUNDRED U.S. DOLLARS (US $100) OR THE AMOUNT YOU PAID US IN THE TWELVE MONTHS BEFORE THE
          CLAIM, WHICHEVER IS GREATER.
        </p>
        <p>
          Some jurisdictions do not allow certain limitations; in those places, our liability is
          limited to the fullest extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="10. Indemnification">
        <p>
          You agree to indemnify and hold harmless Open Source Resume and its operators from claims,
          damages, and expenses (including reasonable attorneys&apos; fees) arising from your use of
          the Service, your content, or your violation of these Terms.
        </p>
      </LegalSection>

      <LegalSection title="11. Termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate access if you
          violate these Terms or if we discontinue the Service. Provisions that by their nature
          should survive termination (including disclaimers, limitations of liability, and
          governing law) will survive.
        </p>
        <p>
          To request deletion of your account data, email{' '}
          <a href="mailto:usaha@csumb.edu" className="text-electric-blue hover:underline">
            usaha@csumb.edu
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="12. Privacy">
        <p>
          Our collection and use of personal information is described in our{' '}
          <a href="/privacy" className="text-electric-blue hover:underline">
            Privacy Policy
          </a>
          , which is incorporated into these Terms by reference.
        </p>
      </LegalSection>

      <LegalSection title="13. Changes to these Terms">
        <p>
          We may update these Terms by posting a revised version on this page with an updated
          effective date. Continued use of the Service after changes become effective constitutes
          acceptance of the revised Terms.
        </p>
      </LegalSection>

      <LegalSection title="14. Governing law">
        <p>
          These Terms are governed by the laws of the State of California, United States, without
          regard to conflict-of-law rules. Courts located in California will have exclusive
          jurisdiction over disputes arising from these Terms or the Service, except where
          applicable law requires otherwise.
        </p>
      </LegalSection>

      <LegalSection title="15. Contact">
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
