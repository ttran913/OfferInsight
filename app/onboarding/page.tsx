import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from 'auth';

export default async function Onboarding() {
  const session = await auth();
  if (!session?.user) {
    redirect('/'); // Redirect to the sign-in page
  }
  return (
    <div>
      <h1>Welcome to the Onboarding Process</h1>
      <p>Select a page to start the onboarding process:</p>
      <ul>
        <li>
          <Link href="/onboarding/page1">
            Go to Page 1
          </Link>
        </li>
        <li>
          <Link href="/onboarding/page2">
            Go to Page 2
          </Link>
        </li>
        <li>
          <Link href="/onboarding/page3">
            Go to Page 3
          </Link>
        </li>
        <li>
          <Link href="/onboarding/page4">
            Go to Page 4
          </Link>
        </li>

      </ul>
    </div>
  );
}