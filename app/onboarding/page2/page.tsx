'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Target, Clock, FileText, Coffee, Users, Building2 } from 'lucide-react';

type TimelineKey = '3' | '6' | '9' | '12';

const CALCULATOR_DATA: Record<TimelineKey, {
  range: string;
  commitment: string;
  apps: string;
  interviewsOutreach: string;
  events: string;
  fairs: string;
  interviews: number;
  offers: number;
}> = {
  '3': { range: '1-3 Months', commitment: '15 Hours', apps: '5 Weekly', interviewsOutreach: '4 Weekly', events: '4 Monthly', fairs: '1 Yearly', interviews: 10, offers: 1 },
  '6': { range: '4-6 Months', commitment: '10 Hours', apps: '3 Weekly', interviewsOutreach: '2 Weekly', events: '3 Monthly', fairs: '1 Yearly', interviews: 15, offers: 1 },
  '9': { range: '7-9 Months', commitment: '8 Hours', apps: '1 Weekly', interviewsOutreach: '2 Weekly', events: '2 Monthly', fairs: '1 Yearly', interviews: 20, offers: 1 },
  '12': { range: '10-12 Months', commitment: '5 Hours', apps: '1 Weekly', interviewsOutreach: '1 Weekly', events: '1 Monthly', fairs: '1 Yearly', interviews: 25, offers: 1 },
};

export default function Page2() {
  const router = useRouter();
  const [selectedTimeline, setSelectedTimeline] = useState<TimelineKey | null>(null);

  const calculator = useMemo(() => {
    if (!selectedTimeline) return null;
    return CALCULATOR_DATA[selectedTimeline];
  }, [selectedTimeline]);

  const handleOptionClick = (value: TimelineKey) => {
    setSelectedTimeline(value);
  };

  const handleBack = () => router.back();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTimeline) return;
    
    // Generate the plan based on the selected timeline
    const plan = calculator!;
    
    const response = await fetch('/api/users/onboarding2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        monthsToSecureInternship: parseInt(selectedTimeline),
        commitment: parseInt(plan.commitment),
        appsWithOutreachPerWeek: parseInt(plan.apps.split(' ')[0]),
        linkedinOutreachPerWeek: parseInt(plan.interviewsOutreach.split(' ')[0]),
        inPersonEventsPerMonth: parseInt(plan.events.split(' ')[0]),
        careerFairsPerYear: parseInt(plan.fairs.split(' ')[0])
      }),
    });

    if (response.ok) {
      router.push('/onboarding/page3');
    } else {
      console.error('Failed to update user information');
    }
  };

  return (
    <div className="min-h-[calc(100dvh-var(--navbar-height))] bg-white flex items-center justify-center">
      <div className="bg-white border border-gray-200 rounded-lg p-10 w-[700px] max-w-4xl">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-gray-900">Cool, now let's set goals</h2>
          <p className="text-gray-600 mt-2">How many months do you have to secure an internship?</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Timeline Selection */}
          <div className="mb-8">
            <div className="flex justify-center space-x-4">
              <button
                type="button"
                onClick={() => handleOptionClick('3')}
                className={`border-2 rounded-lg py-4 px-8 font-semibold transition-all cursor-pointer hover:scale-105 hover:shadow-lg ${
                  selectedTimeline === '3'
                    ? 'bg-electric-blue border-electric-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                    : 'bg-white border-gray-300 text-gray-900 hover:border-electric-blue hover:bg-gray-50'
                }`}
              >
                {selectedTimeline === '3' && '✓ '}
                1-3 Months
              </button>
              <button
                type="button"
                onClick={() => handleOptionClick('6')}
                className={`border-2 rounded-lg py-4 px-8 font-semibold transition-all cursor-pointer hover:scale-105 hover:shadow-lg ${
                  selectedTimeline === '6'
                    ? 'bg-electric-blue border-electric-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                    : 'bg-white border-gray-300 text-gray-900 hover:border-electric-blue hover:bg-gray-50'
                }`}
              >
                {selectedTimeline === '6' && '✓ '}
                4-6 Months
              </button>
              <button
                type="button"
                onClick={() => handleOptionClick('9')}
                className={`border-2 rounded-lg py-4 px-8 font-semibold transition-all cursor-pointer hover:scale-105 hover:shadow-lg ${
                  selectedTimeline === '9'
                    ? 'bg-electric-blue border-electric-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                    : 'bg-white border-gray-300 text-gray-900 hover:border-electric-blue hover:bg-gray-50'
                }`}
              >
                {selectedTimeline === '9' && '✓ '}
                7-9 Months
              </button>
              <button
                type="button"
                onClick={() => handleOptionClick('12')}
                className={`border-2 rounded-lg py-4 px-8 font-semibold transition-all cursor-pointer hover:scale-105 hover:shadow-lg ${
                  selectedTimeline === '12'
                    ? 'bg-electric-blue border-electric-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                    : 'bg-white border-gray-300 text-gray-900 hover:border-electric-blue hover:bg-gray-50'
                }`}
              >
                {selectedTimeline === '12' && '✓ '}
                10-12 Months
              </button>
            </div>
          </div>

          {/* Success Calculator Preview */}
          <div className={`border rounded-lg p-6 mb-8 transition-all ${
            selectedTimeline 
              ? 'bg-gray-100 border-gray-200' 
              : 'bg-gray-50 border-gray-200 opacity-60'
          }`}>
            <h3 className={`font-semibold text-lg mb-6 flex items-center justify-center transition-colors ${
              selectedTimeline 
                ? 'text-gray-900' 
                : 'text-gray-400'
            }`}>
              <Target className={`mr-3 h-4 w-4 transition-colors ${
                selectedTimeline 
                  ? 'text-electric-blue' 
                  : 'text-gray-500'
              }`} />
              Your Action Plan Preview
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className={`rounded-lg p-4 transition-colors ${
                selectedTimeline 
                  ? 'bg-gray-50' 
                  : 'bg-gray-50'
              }`}>
                <div className={`text-sm mb-1 transition-colors ${
                  selectedTimeline 
                    ? 'text-gray-600' 
                    : 'text-gray-500'
                }`}>Timeline</div>
                <div className={`text-xl font-bold transition-colors ${
                  selectedTimeline 
                    ? 'text-electric-blue' 
                    : 'text-gray-500'
                }`}>{calculator?.range || '-'}</div>
              </div>
              <div className={`rounded-lg p-4 transition-colors ${
                selectedTimeline 
                  ? 'bg-gray-50' 
                  : 'bg-gray-50'
              }`}>
                <div className={`text-sm mb-1 flex items-center transition-colors ${
                  selectedTimeline 
                    ? 'text-gray-600' 
                    : 'text-gray-500'
                }`}>
                  <Clock className="mr-2 h-4 w-4" />
                  Weekly Commitment
                </div>
                <div className={`text-xl font-bold transition-colors ${
                  selectedTimeline 
                    ? 'text-electric-blue' 
                    : 'text-gray-500'
                }`}>{calculator?.commitment || '-'}</div>
              </div>
              <div className={`rounded-lg p-4 transition-colors ${
                selectedTimeline 
                  ? 'bg-gray-50' 
                  : 'bg-gray-50'
              }`}>
                <div className={`text-sm mb-1 flex items-center transition-colors ${
                  selectedTimeline 
                    ? 'text-gray-600' 
                    : 'text-gray-500'
                }`}>
                  <FileText className="mr-2 h-4 w-4" />
                  Applications
                </div>
                <div className={`text-xl font-bold transition-colors ${
                  selectedTimeline 
                    ? 'text-electric-blue' 
                    : 'text-gray-500'
                }`}>{calculator?.apps || '-'}</div>
              </div>
              <div className={`rounded-lg p-4 transition-colors ${
                selectedTimeline 
                  ? 'bg-gray-50' 
                  : 'bg-gray-50'
              }`}>
                <div className={`text-sm mb-1 flex items-center transition-colors ${
                  selectedTimeline 
                    ? 'text-gray-600' 
                    : 'text-gray-500'
                }`}>
                  <Coffee className="mr-2 h-4 w-4" />
                  Coffee Chats
                </div>
                <div className={`text-xl font-bold transition-colors ${
                  selectedTimeline 
                    ? 'text-electric-blue' 
                    : 'text-gray-500'
                }`}>{calculator?.interviewsOutreach || '-'}</div>
              </div>
              <div className={`rounded-lg p-4 transition-colors ${
                selectedTimeline 
                  ? 'bg-gray-50' 
                  : 'bg-gray-50'
              }`}>
                <div className={`text-sm mb-1 flex items-center transition-colors ${
                  selectedTimeline 
                    ? 'text-gray-600' 
                    : 'text-gray-500'
                }`}>
                  <Users className="mr-2 h-4 w-4" />
                  In-Person Events
                </div>
                <div className={`text-xl font-bold transition-colors ${
                  selectedTimeline 
                    ? 'text-electric-blue' 
                    : 'text-gray-500'
                }`}>{calculator?.events || '-'}</div>
              </div>
              <div className={`rounded-lg p-4 transition-colors ${
                selectedTimeline 
                  ? 'bg-gray-50' 
                  : 'bg-gray-50'
              }`}>
                <div className={`text-sm mb-1 flex items-center transition-colors ${
                  selectedTimeline 
                    ? 'text-gray-600' 
                    : 'text-gray-500'
                }`}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Career Fairs
                </div>
                <div className={`text-xl font-bold transition-colors ${
                  selectedTimeline 
                    ? 'text-electric-blue' 
                    : 'text-gray-500'
                }`}>{calculator?.fairs || '-'}</div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex space-x-4">
            <button 
              type="button" 
              onClick={handleBack} 
              className="flex-1 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-900 py-4 rounded-lg font-semibold transition-colors flex items-center justify-center"
            >
              <ArrowLeft className="mr-2" />
              Back
            </button>
            <button
              type="submit"
              className="flex-2 bg-electric-blue hover:bg-blue-600 text-white py-4 px-8 rounded-lg font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              disabled={!selectedTimeline}
            >
              Continue
            </button>
          </div>
          
          {/* Step Indicator */}
          <div className="flex items-center justify-center mt-6">
            <div className="flex space-x-2">
              <div className="w-3 h-3 bg-electric-blue rounded-full"></div>
              <div className="w-3 h-3 bg-electric-blue rounded-full"></div>
              <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
            </div>
            <span className="text-gray-400 ml-3 text-sm">Step 2 of 3</span>
          </div>
        </form>
      </div>
    </div>
  );
}


