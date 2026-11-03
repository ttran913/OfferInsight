'use client';

import type { CSSProperties, RefObject } from 'react';
import Link from 'next/link';
import { HIRING_MANAGER_CALENDLY_URL } from './homeCtas';

const ACCENT_CORAL = '#F57360';
const ACCENT_TEAL = '#58A4B0';

type IntroActionsSectionProps = {
  sectionShell: string;
  sectionStyle?: CSSProperties;
  sectionRef: RefObject<HTMLElement | null>;
  onSignUp: () => void;
  /** Full compact band (<1278): densify so Contact fits one phone viewport. */
  compactLayout?: boolean;
};

export function IntroActionsSection({
  sectionShell,
  sectionStyle,
  sectionRef,
  onSignUp,
  compactLayout = false,
}: IntroActionsSectionProps) {
  return (
    <section
      ref={sectionRef}
      id="intro-actions"
      className={`${sectionShell} overflow-hidden bg-white opacity-0`}
      style={sectionStyle}
      aria-labelledby="intro-actions-heading"
    >
      <div
        className={`relative z-[2] flex h-full w-full items-center justify-center px-4 sm:px-8 ${
          compactLayout ? 'overflow-y-auto pb-3 pt-12' : 'overflow-hidden'
        }`}
      >
        <div className="w-full max-w-6xl">
          <div className="text-center">
            <h2
              id="intro-actions-heading"
              className={
                compactLayout
                  ? 'text-2xl font-bold tracking-tight text-black'
                  : 'text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl'
              }
            >
              What&apos;s next?
            </h2>
          </div>

          <div
            className={
              compactLayout
                ? 'mt-3 grid gap-3'
                : 'mt-8 grid gap-6 sm:mt-10 md:grid-cols-2 md:gap-8'
            }
          >
            <div
              className={
                compactLayout
                  ? 'flex flex-col rounded-xl border border-light-steel-blue/40 bg-white p-4 shadow-sm'
                  : 'flex min-h-[280px] flex-col rounded-2xl border border-light-steel-blue/40 bg-white p-8 shadow-sm sm:min-h-[320px] sm:p-10 md:min-h-[360px]'
              }
            >
              <p
                className={
                  compactLayout
                    ? 'text-[11px] font-bold uppercase tracking-widest'
                    : 'text-sm font-bold uppercase tracking-widest sm:text-base'
                }
                style={{ color: ACCENT_CORAL }}
              >
                For candidates
              </p>
              <h3
                className={
                  compactLayout
                    ? 'mt-1.5 text-lg font-bold text-black'
                    : 'mt-4 text-2xl font-bold text-black sm:text-3xl'
                }
              >
                Start your pathway
              </h3>
              <p
                className={
                  compactLayout
                    ? 'mt-1.5 text-sm leading-snug text-gray-700'
                    : 'mt-4 flex-1 text-lg leading-relaxed text-gray-700 sm:text-xl'
                }
              >
                Sign up to track open source achievements and work toward hiring-manager-defined
                benchmarks.
              </p>
              <button
                type="button"
                onClick={onSignUp}
                className={
                  compactLayout
                    ? 'mt-3 inline-flex w-full cursor-pointer items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90'
                    : 'mt-8 inline-flex w-full cursor-pointer items-center justify-center rounded-lg px-6 py-4 text-lg font-semibold text-white transition-colors hover:opacity-90 sm:w-auto'
                }
                style={{ backgroundColor: ACCENT_CORAL }}
              >
                Sign up
              </button>
            </div>

            <div
              className={
                compactLayout
                  ? 'flex flex-col rounded-xl border border-light-steel-blue/40 bg-white p-4 shadow-sm'
                  : 'flex min-h-[280px] flex-col rounded-2xl border border-light-steel-blue/40 bg-white p-8 shadow-sm sm:min-h-[320px] sm:p-10 md:min-h-[360px]'
              }
            >
              <p
                className={
                  compactLayout
                    ? 'text-[11px] font-bold uppercase tracking-widest'
                    : 'text-sm font-bold uppercase tracking-widest sm:text-base'
                }
                style={{ color: ACCENT_TEAL }}
              >
                For hiring managers &amp; recruiters
              </p>
              <h3
                className={
                  compactLayout
                    ? 'mt-1.5 text-lg font-bold text-black'
                    : 'mt-4 text-2xl font-bold text-black sm:text-3xl'
                }
              >
                Partner with us
              </h3>
              <p
                className={
                  compactLayout
                    ? 'mt-1.5 text-sm leading-snug text-gray-700'
                    : 'mt-4 flex-1 text-lg leading-relaxed text-gray-700 sm:text-xl'
                }
              >
                Schedule a conversation with Utsab Saha to learn how your team can define a personal
                bar and interview qualified candidates.
              </p>
              <a
                href={HIRING_MANAGER_CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  compactLayout
                    ? 'mt-3 inline-flex w-full cursor-pointer items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90'
                    : 'mt-8 inline-flex w-full cursor-pointer items-center justify-center rounded-lg px-6 py-4 text-lg font-semibold text-white transition-colors hover:opacity-90 sm:w-auto'
                }
                style={{ backgroundColor: ACCENT_TEAL }}
              >
                Schedule a meeting
              </a>
            </div>
          </div>

          <p
            className={
              compactLayout
                ? 'mt-4 text-center text-xs text-gray-500'
                : 'mt-8 text-center text-sm text-gray-500 sm:mt-10'
            }
          >
            <Link href="/privacy" className="hover:text-gray-800 hover:underline">
              Privacy Policy
            </Link>
            <span className="mx-2 text-gray-300" aria-hidden>
              ·
            </span>
            <Link href="/terms" className="hover:text-gray-800 hover:underline">
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
