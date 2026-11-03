import Link from 'next/link';

export function LegalDoc({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm text-gray-500">
        <Link href="/" className="text-electric-blue hover:underline">
          Open Source Resume
        </Link>
        {' / '}
        {title}
      </p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-gray-600">Effective date: {effectiveDate}</p>
      <div className="legal-prose mt-8 space-y-6 text-[15px] leading-relaxed text-gray-800">
        {children}
      </div>
      <p className="mt-12 border-t border-gray-200 pt-6 text-sm text-gray-500">
        <Link href="/privacy" className="text-electric-blue hover:underline">
          Privacy Policy
        </Link>
        <span className="mx-2 text-gray-300">|</span>
        <Link href="/terms" className="text-electric-blue hover:underline">
          Terms of Service
        </Link>
      </p>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}
