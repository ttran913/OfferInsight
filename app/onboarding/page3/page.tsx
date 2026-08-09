'use client';

import { useEffect, useMemo, useState, ChangeEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Coffee, Users, Building2, ArrowLeft, Rocket, Target, CalendarCheck, Loader2 } from 'lucide-react';
import { formatDateWithFullMonth } from '@/app/dashboard/components/shared';

const MONTH_OPTIONS = [
  { label: 'January', value: 0 },
  { label: 'February', value: 1 },
  { label: 'March', value: 2 },
  { label: 'April', value: 3 },
  { label: 'May', value: 4 },
  { label: 'June', value: 5 },
  { label: 'July', value: 6 },
  { label: 'August', value: 7 },
  { label: 'September', value: 8 },
  { label: 'October', value: 9 },
  { label: 'November', value: 10 },
  { label: 'December', value: 11 },
];

function calculateEstimatedOfferDate(
  appsWithOutreachPerWeek: number,
  linkedinOutreachPerWeek: number,
  inPersonEventsPerMonth: number,
  careerFairsPerYear: number,
  referenceDate?: Date
) {
  let offersPerAppWithOutreach = 0.0025;
  let offersPerLinkedinOutreachAttempt = 0.00075;
  let offersPerInPersonEvent = 0.0075;
  let offersPerCareerFair = 0.1;

  let bonusPoints = 0;

  if (linkedinOutreachPerWeek >= 20) {
    bonusPoints += 20;
  } else if (linkedinOutreachPerWeek >= 12) {
    bonusPoints += 11;
  } else if (linkedinOutreachPerWeek >= 6) {
    bonusPoints += 6;
  } else if (linkedinOutreachPerWeek >= 1) {
    bonusPoints += 1;
  }

  if (inPersonEventsPerMonth >= 8) {
    bonusPoints += 80;
  } else if (inPersonEventsPerMonth >= 4) {
    bonusPoints += 40;
  } else if (inPersonEventsPerMonth >= 2) {
    bonusPoints += 20;
  } else if (inPersonEventsPerMonth >= 1) {
    bonusPoints += 10;
  }

  if (careerFairsPerYear >= 4) {
    bonusPoints += 80;
  } else if (careerFairsPerYear >= 3) {
    bonusPoints += 40;
  } else if (careerFairsPerYear >= 2) {
    bonusPoints += 20;
  } else if (careerFairsPerYear >= 1) {
    bonusPoints += 10;
  }

  const a = 2.0;
  const b = 0.01;
  const multiplier = 3 - a * Math.exp(-b * bonusPoints);

  offersPerAppWithOutreach *= multiplier;
  offersPerLinkedinOutreachAttempt *= multiplier;
  offersPerInPersonEvent *= multiplier;
  offersPerCareerFair *= multiplier;

  const totalOffersPerWeek =
    appsWithOutreachPerWeek * offersPerAppWithOutreach +
    linkedinOutreachPerWeek * offersPerLinkedinOutreachAttempt +
    inPersonEventsPerMonth * offersPerInPersonEvent +
    (careerFairsPerYear / 52) * offersPerCareerFair;

  if (!Number.isFinite(totalOffersPerWeek) || totalOffersPerWeek <= 0) {
    return new Date(); //to do: handle error case more gracefully
  }

  const totalWeeks = 3 + 1 / totalOffersPerWeek;
  const baseDate = referenceDate ?? new Date(); //to do: handle case where user comes back to this page at a later date to edit their plan, we may want to use a earlier reference date
  return new Date(baseDate.getTime() + totalWeeks * 7 * 24 * 60 * 60 * 1000);
}

function calculateWeeklyHours(appsPerWeek: number, interviewsPerWeek: number, eventsPerMonth: number, fairsPerYear: number) {
  let hoursPerAppWithOutreach = 1;
  let hoursPerLinkedinOutreachAttempt = 0.5;
  let hoursPerInPersonEvent = 4/4.33;
  let hoursPerCareerFair = 10/26; //We are assuming that the average target offer date is 6 months into the future, so they only have 26 weeks to attends the target number of career fairs

  return Math.round(appsPerWeek * hoursPerAppWithOutreach + interviewsPerWeek * hoursPerLinkedinOutreachAttempt + eventsPerMonth * hoursPerInPersonEvent + fairsPerYear * hoursPerCareerFair);
}

function Page3Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromDashboard = searchParams.get('from') === 'dashboard';
  const today = useMemo(() => new Date(), []);

  // Goals (sliders)
  const [appsPerWeek, setAppsPerWeek] = useState<number>(5);
  const [interviewsPerWeek, setInterviewsPerWeek] = useState<number>(2);
  const [eventsPerMonth, setEventsPerMonth] = useState<number>(3);
  const [fairsPerYear, setFairsPerYear] = useState<number>(1);
  const [hoursPerWeek, setHoursPerWeek] = useState<number>(12);
  const [planStartDate, setPlanStartDate] = useState<Date | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize values from server (based on selections saved in page2)
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const res = await fetch('/api/users/onboarding2');
        if (!res.ok) return;
        const user = await res.json();
        if (typeof user.appsWithOutreachPerWeek === 'number') {
          setAppsPerWeek(user.appsWithOutreachPerWeek);
        }
        if (typeof user.linkedinOutreachPerWeek === 'number') {
          setInterviewsPerWeek(user.linkedinOutreachPerWeek);
        }
        if (typeof user.inPersonEventsPerMonth === 'number') {
          setEventsPerMonth(user.inPersonEventsPerMonth);
        }
        if (typeof user.careerFairsPerYear === 'number') {
          setFairsPerYear(user.careerFairsPerYear);
        }
        if (typeof user.commitment === 'number') {
          setHoursPerWeek(user.commitment);
        }
        if (user.resetStartDate) {
          const parsed = new Date(user.resetStartDate);
          if (!Number.isNaN(parsed.getTime())) {
            setPlanStartDate(parsed);
            setSelectedYear(parsed.getFullYear());
            setSelectedMonth(parsed.getMonth());
            setSelectedDay(parsed.getDate());
          }
        } else {
          const fallback = new Date();
          setPlanStartDate(fallback);
          setSelectedYear(fallback.getFullYear());
          setSelectedMonth(fallback.getMonth());
          setSelectedDay(fallback.getDate());
        }
      } catch (e) {
        console.error('Failed to load initial onboarding values:', e);
        const fallback = new Date();
        setPlanStartDate(fallback);
        setSelectedYear(fallback.getFullYear());
        setSelectedMonth(fallback.getMonth());
        setSelectedDay(fallback.getDate());
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitial();
  }, []);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, idx) => currentYear - 2 + idx);
  }, []);

  const daysInSelectedMonth = useMemo(() => new Date(selectedYear, selectedMonth + 1, 0).getDate(), [selectedYear, selectedMonth]);

  useEffect(() => {
    if (selectedDay > daysInSelectedMonth) {
      const clampedDay = daysInSelectedMonth;
      setSelectedDay(clampedDay);
      setPlanStartDate(new Date(selectedYear, selectedMonth, clampedDay));
    }
  }, [daysInSelectedMonth, selectedDay, selectedYear, selectedMonth]);

  const handleYearChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const year = Number(event.target.value);
    const maxDay = new Date(year, selectedMonth + 1, 0).getDate();
    const day = Math.min(selectedDay, maxDay);
    setSelectedYear(year);
    setSelectedDay(day);
    setPlanStartDate(new Date(year, selectedMonth, day));
  };

  const handleMonthChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const month = Number(event.target.value);
    const maxDay = new Date(selectedYear, month + 1, 0).getDate();
    const day = Math.min(selectedDay, maxDay);
    setSelectedMonth(month);
    setSelectedDay(day);
    setPlanStartDate(new Date(selectedYear, month, day));
  };

  const handleDayChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const day = Number(event.target.value);
    setSelectedDay(day);
    setPlanStartDate(new Date(selectedYear, selectedMonth, day));
  };

  // Target Offer Date calculations (adapted from original page3, with fairs)
  const targetOfferDate = useMemo(
    () =>
      calculateEstimatedOfferDate(
        appsPerWeek,
        interviewsPerWeek,
        eventsPerMonth,
        fairsPerYear,
        planStartDate ?? undefined
      ),
    [appsPerWeek, interviewsPerWeek, eventsPerMonth, fairsPerYear, planStartDate]
  );

  const weeklyHours = Math.round(hoursPerWeek);

  const handleBack = () => router.back();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const response = await fetch('/api/users/onboarding3', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commitment: weeklyHours,
        appsWithOutreachPerWeek: appsPerWeek,
        linkedinOutreachPerWeek: interviewsPerWeek,
        inPersonEventsPerMonth: eventsPerMonth,
        careerFairsPerYear: fairsPerYear,
        targetOfferDate: targetOfferDate.toISOString(),
        resetStartDate: planStartDate ? planStartDate.toISOString().split('T')[0] : undefined,
      }),
    });

    if (response.ok) {
      router.push('/dashboard');
    } else {
      console.error('Failed to update user plan');
    }
  };

  return (
    <div className="min-h-[calc(100dvh-var(--navbar-height))] bg-white flex items-center justify-center">
      <div className="bg-white border border-gray-200 rounded-lg p-10 w-[700px] max-w-4xl">
        {/* Header (condensed) */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-gray-900">Fine-tune Your Action Plan</h2>
        </div>

        {/* Form */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-600">
            <Loader2 className="h-12 w-12 animate-spin text-electric-blue" />
            <p className="mt-4 text-sm">Loading your action plan...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
          {/* Target Outcome */}
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 mb-8">
            <h3 className="text-gray-900 font-bold text-lg mb-6 flex items-center justify-center">
              <Target className="text-electric-blue mr-3" />
              Target Outcome with Your Custom Plan
            </h3>
            <div className="flex flex-col items-center justify-center gap-6 md:flex-row md:gap-12">
              <div className="text-center bg-gray-50 rounded-lg p-6 min-w-[180px]">
                <div className="text-3xl font-bold text-electric-blue mb-2">
                  {formatDateWithFullMonth(targetOfferDate)}
                </div>
                <div className="text-gray-600 text-sm font-medium">Target Offer Date</div>
              </div>
              <div className="text-center bg-gray-50 rounded-lg p-6 min-w-[180px]">
                <div className="text-3xl font-bold text-electric-blue mb-2">{calculateWeeklyHours(appsPerWeek, interviewsPerWeek, eventsPerMonth, fairsPerYear)}</div>
                <div className="text-gray-600 text-sm font-medium">Hours per Week</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Applications */}
            <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 hover:border-electric-blue/50 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-gray-900 font-bold text-lg flex items-center">
                  <FileText className="text-electric-blue mr-3" />
                  High Quality Applications
                </h4>
                <div className="text-electric-blue text-sm font-semibold">WEEKLY</div>
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Target per week:</span>
                  <span className="text-gray-900 font-bold text-xl">{appsPerWeek}</span>
                </div>
                <input
                  type="range"
                  className="w-full h-2 bg-white rounded-lg appearance-none cursor-pointer slider"
                  min={1}
                  max={15}
                  value={appsPerWeek}
                  onChange={(e) => setAppsPerWeek(Number(e.target.value))}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1</span>
                  <span>15</span>
                </div>
              </div>
            </div>

            {/* Coffee Chats */}
            <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 hover:border-electric-blue/50 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-gray-900 font-bold text-lg flex items-center">
                  <Coffee className="text-electric-blue mr-3" />
                  Coffee Chats
                </h4>
                <div className="text-electric-blue text-sm font-semibold">WEEKLY</div>
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Target per week:</span>
                  <span className="text-gray-900 font-bold text-xl">{interviewsPerWeek}</span>
                </div>
                <input
                  type="range"
                  className="w-full h-2 bg-white rounded-lg appearance-none cursor-pointer slider"
                  min={0}
                  max={8}
                  value={interviewsPerWeek}
                  onChange={(e) => setInterviewsPerWeek(Number(e.target.value))}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0</span>
                  <span>8</span>
                </div>
              </div>
            </div>

            {/* Events */}
            <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 hover:border-electric-blue/50 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-gray-900 font-bold text-lg flex items-center">
                  <Users className="text-electric-blue mr-3" />
                  In-Person Events
                </h4>
                <div className="text-electric-blue text-sm font-semibold">MONTHLY</div>
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Target per month:</span>
                  <span className="text-gray-900 font-bold text-xl">{eventsPerMonth}</span>
                </div>
                <input
                  type="range"
                  className="w-full h-2 bg-white rounded-lg appearance-none cursor-pointer slider"
                  min={0}
                  max={10}
                  value={eventsPerMonth}
                  onChange={(e) => setEventsPerMonth(Number(e.target.value))}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0</span>
                  <span>10</span>
                </div>
              </div>
            </div>

            {/* Career Fairs */}
            <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 hover:border-electric-blue/50 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-gray-900 font-bold text-lg flex items-center">
                  <Building2 className="text-electric-blue mr-3" />
                  Career Fairs
                </h4>
                <div className="text-electric-blue text-sm font-semibold">YEARLY</div>
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Total per year:</span>
                  <span className="text-gray-900 font-bold text-xl">{fairsPerYear}</span>
                </div>
                <input
                  type="range"
                  className="w-full h-2 bg-white rounded-lg appearance-none cursor-pointer slider"
                  min={0}
                  max={8}
                  value={fairsPerYear}
                  onChange={(e) => setFairsPerYear(Number(e.target.value))}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0</span>
                  <span>8</span>
                </div>
              </div>
            </div>
          </div>

        {/* Plan Start Date */}
        <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-gray-900 font-bold text-lg flex items-center">
              <CalendarCheck className="text-electric-blue mr-3" />
              Plan Start Date
            </h4>
            <span className="text-gray-400 text-sm">Adjust your baseline</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-2">Month</label>
              <select
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-electric-blue"
                value={selectedMonth}
                onChange={handleMonthChange}
              >
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-2">Day</label>
              <select
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-electric-blue"
                value={selectedDay}
                onChange={handleDayChange}
              >
                {Array.from({ length: daysInSelectedMonth }, (_, idx) => idx + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-2">Year</label>
              <select
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-electric-blue"
                value={selectedYear}
                onChange={handleYearChange}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

          {/* Buttons */}
          <div className={`flex space-x-4 ${fromDashboard ? 'justify-center' : ''}`}>
            {!fromDashboard && (
              <button type="button" onClick={handleBack} className="flex-1 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-900 py-4 rounded-lg font-semibold transition-colors flex items-center justify-center">
                <ArrowLeft className="mr-2" />
                Back
              </button>
            )}
            <button type="submit" className={`${fromDashboard ? 'w-full' : 'flex-2'} bg-electric-blue hover:bg-blue-600 text-white py-4 px-8 rounded-lg font-bold text-lg transition-colors flex items-center justify-center`}>
              <Rocket className="mr-2" />
              Start Tracking My Progress
            </button>
          </div>
          
          {/* Step Indicator */}
          {!fromDashboard && (
            <div className="flex items-center justify-center mt-6">
              <div className="flex space-x-2">
                <div className="w-3 h-3 bg-electric-blue rounded-full"></div>
                <div className="w-3 h-3 bg-electric-blue rounded-full"></div>
                <div className="w-3 h-3 bg-electric-blue rounded-full"></div>
              </div>
              <span className="text-gray-400 ml-3 text-sm">Step 3 of 3</span>
            </div>
          )}
          </form>
        )}
      </div>
    </div>
  );
}

export default function Page3() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100dvh-var(--navbar-height))] bg-white flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-lg p-10 w-[700px] max-w-4xl">
          <div className="flex flex-col items-center justify-center py-32 text-gray-600">
            <Loader2 className="h-12 w-12 animate-spin text-electric-blue" />
            <p className="mt-4 text-sm">Loading...</p>
          </div>
        </div>
      </div>
    }>
      <Page3Content />
    </Suspense>
  );
}


