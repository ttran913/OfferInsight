import { ReactNode } from 'react';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    // <div>
    //   <header>
    //     <h1>Onboarding Process</h1>
    //   </header>
    //   <main>{children}</main>
    //   <footer>
    //     <nav>
    //       <ul>
    //         <li>
    //           <Link href="/onboarding">
    //             Go to Onboarding
    //           </Link>
    //         </li>
    //         <li>
    //           <Link href="/">
    //             Go to Homepage
    //           </Link>
    //         </li>
    //       </ul>
    //     </nav>
    //   </footer>
    // </div>
    <div>
      <main>{children}</main>
    </div>
  );
}