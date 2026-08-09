"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkAuth } from '../../server';
import { User, GraduationCap, Calendar, Code, Loader2, ArrowRight } from 'lucide-react';
import './page.css';

export default function Page1() {
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [major, setMajor] = useState('');
  const [leetCodeUserName, setLeetCodeUserName] = useState('');
  const [graduationMonth, setGraduationMonth] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function authenticate() {
      const session = await checkAuth();
      setLoading(false);
    }
    authenticate();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const response = await fetch('/api/users/onboarding1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        school,
        major,
        leetCodeUserName: leetCodeUserName.trim(),
        expectedGraduationDate: `${graduationYear}-${graduationMonth.padStart(2, '0')}-01`,
      }),
    });

    if (response.ok) {
      console.log('User information updated successfully');
      router.push('/onboarding/page2');
    } else {
      console.error('Failed to update user information');
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (confirm('Are you sure you want to skip? This information helps us personalize your experience.')) {
      router.push('/onboarding/page2');
    }
  };

  // Generate years from current year - 30 to current year + 10
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 41 }, (_, i) => currentYear - 30 + i);
  
  const months = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];

  if (loading) {
    return (
      <div data-onboarding-page="page1" className="min-h-screen min-h-[calc(100dvh-var(--navbar-height))] bg-white flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-lg p-7 w-[700px] max-w-4xl">
          <div className="flex flex-col items-center justify-center py-32 text-gray-600">
            <Loader2 className="h-12 w-12 animate-spin text-electric-blue" />
            <p className="mt-4 text-sm">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-onboarding-page="page1" className="min-h-screen min-h-[calc(100dvh-var(--navbar-height))] bg-white flex items-center justify-center">
      <div className="bg-white border border-gray-200 rounded-lg p-7 w-[700px] max-w-4xl">
        {/* Header */}
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Welcome Aboard!</h2>
          <p className="text-gray-600 mt-1 text-sm">Let's set up your profile</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="form-group">
            <label className="block text-gray-900 font-semibold mb-1.5 text-sm flex items-center">
              <User className="text-electric-blue mr-2 h-4 w-4 shrink-0" />
              Full Name
            </label>
            <input 
              type="text" 
              name="fullName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3.5 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-electric-blue focus:ring-2 focus:ring-electric-blue/50 transition-all" 
              placeholder="Enter your full name"
              required
            />
          </div>

          <div className="form-group">
            <label className="block text-gray-900 font-semibold mb-1.5 text-sm flex items-center">
              <GraduationCap className="text-electric-blue mr-2 h-4 w-4 shrink-0" />
              School / University
            </label>
            <input 
              type="text" 
              name="school"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3.5 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-electric-blue focus:ring-2 focus:ring-electric-blue/50 transition-all" 
              placeholder="e.g., Stanford University, MIT, UC Berkeley"
              required
            />
          </div>

          <div className="form-group">
            <label className="block text-gray-900 font-semibold mb-1.5 text-sm flex items-center">
              <GraduationCap className="text-electric-blue mr-2 h-4 w-4 shrink-0" />
              Major / Field of Study
            </label>
            <input 
              type="text" 
              name="major"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3.5 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-electric-blue focus:ring-2 focus:ring-electric-blue/50 transition-all" 
              placeholder="e.g., Computer Science, Business Administration"
              required
            />
          </div>

          <div className="form-group">
            <label className="block text-gray-900 font-semibold mb-1.5 text-sm flex items-center">
              <Code className="text-electric-blue mr-2 h-4 w-4 shrink-0" />
              LeetCode username
            </label>
            <input
              type="text"
              name="leetCodeUserName"
              value={leetCodeUserName}
              onChange={(e) => setLeetCodeUserName(e.target.value)}
              className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3.5 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-electric-blue focus:ring-2 focus:ring-electric-blue/50 transition-all"
              placeholder="e.g., your_handle (leetcode.com/u/…)"
              autoComplete="username"
            />
            <p className="text-gray-500 text-xs mt-1">Optional — used to show your public profile stats later.</p>
          </div>

          <div className="form-group">
            <label className="block text-gray-900 font-semibold mb-1.5 text-sm flex items-center">
              <Calendar className="text-electric-blue mr-2 h-4 w-4 shrink-0" />
              Expected Graduation Date
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-600 text-xs mb-1">Month</label>
                <select 
                  name="graduationMonth"
                  value={graduationMonth}
                  onChange={(e) => setGraduationMonth(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-electric-blue"
                  required
                >
                  <option value="">Select month</option>
                  {months.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-600 text-xs mb-1">Year</label>
                <select 
                  name="graduationYear"
                  value={graduationYear}
                  onChange={(e) => setGraduationYear(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-electric-blue"
                  required
                >
                  <option value="">Select year</option>
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex space-x-4 pt-3">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="flex-1 bg-electric-blue hover:bg-blue-600 text-white py-3 px-6 rounded-lg font-bold text-sm transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Continue to Timeline Setup
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </button>
          </div>
          
          {/* Step Indicator */}
          <div className="flex items-center justify-center mt-3">
            <div className="flex space-x-2">
              <div className="w-3 h-3 bg-electric-blue rounded-full"></div>
              <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
              <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
            </div>
            <span className="text-gray-400 ml-3 text-sm">Step 1 of 3</span>
          </div>
        </form>
      </div>
    </div>
  );
}
