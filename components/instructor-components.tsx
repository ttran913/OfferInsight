"use client"

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardNavButton } from "./dashboard-nav-button";
import { Settings } from "lucide-react";

// Instructor Authenticated Button - shown when instructor is signed in
interface InstructorData {
  username: string;
}

export function InstructorAuthenticatedButton() {
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [instructorData, setInstructorData] = useState<InstructorData | null>(null);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    // Fetch instructor data
    const fetchInstructorData = async () => {
      try {
        const response = await fetch('/api/instructor');
        if (response.ok) {
          const instructor = await response.json();
          setInstructorData({ username: instructor.username });
        }
      } catch (error) {
        console.error('Failed to fetch instructor data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInstructorData();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSettingsDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch('/api/instructor', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'signout' }),
      });
      setShowSettingsDropdown(false);
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  // Default instructor profile picture - using a generic instructor/teacher icon
  const defaultInstructorImage = "https://ui-avatars.com/api/?name=Instructor&background=007ACC&color=fff&size=128";

  return (
    <div className="flex items-center space-x-3 sm:space-x-4">
      <DashboardNavButton instructor />
      <nav className="flex items-center">
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
            className="flex items-center gap-2 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
            <span className="hidden md:inline text-sm">Settings</span>
          </button>
          
          {showSettingsDropdown && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
              <div className="py-2">
                <div className="px-4 py-2">
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
      <div className="flex items-center gap-2">
        {!loading && (
          <>
            <span className="hidden text-sm text-gray-900 md:inline">
              {instructorData?.username || 'Instructor'}
            </span>
            <img 
              src={defaultInstructorImage}
              className="w-8 h-8 rounded-full"
              alt="Instructor avatar"
            />
          </>
        )}
      </div>
    </div>
  );
}

