'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SignOut } from "./auth-components"
import { DashboardNavButton } from "./dashboard-nav-button";
import { Settings } from "lucide-react";

interface UserData {
  name: string | null;
  image: string | null;
  onboardingProgress: number | null;
}

export function AuthenticatedUserButton() {
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [userData, setUserData] = useState<UserData>({
    name: null,
    image: null,
    onboardingProgress: null,
  });
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Fetch user data
    const fetchUserData = async () => {
      try {
        const response = await fetch('/api/users/onboarding2');
        if (response.ok) {
          const user = await response.json();
          setUserData({
            name: user.name,
            image: user.image,
            onboardingProgress: user.onboardingProgress,
          });
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [pathname]); // Refetch when route changes (e.g., after onboarding)

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

  return (
    <div className="flex items-center space-x-3 sm:space-x-4">
      <DashboardNavButton onboardingProgress={userData.onboardingProgress} />
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
                <button
                  onClick={() => {
                    setShowSettingsDropdown(false);
                    router.push('/account');
                  }}
                  className="w-full px-4 py-2 text-left text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  Account
                </button>
                <hr className="my-1 border-gray-200" />
                {/* ===== PROFILE & PREFERENCES: Commented out until features are implemented ===== */}
                {/* Uncomment the buttons below when Profile and Preferences features are ready */}
                {/* 
                <button 
                  onClick={() => setShowSettingsDropdown(false)}
                  className="w-full px-4 py-2 text-left text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 flex items-center"
                >
                  <User className="mr-2" />Profile
                </button>
                <button 
                  onClick={() => setShowSettingsDropdown(false)}
                  className="w-full px-4 py-2 text-left text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 flex items-center"
                >
                  <Cog className="mr-2" />Preferences
                </button>
                <hr className="my-1 border-gray-200" />
                */}
                <div className="px-4 py-2">
                  <SignOut />
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
              {userData.name || 'User'}
            </span>
            <img 
              src={userData.image || "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg"} 
              className="w-8 h-8 rounded-full"
              alt="User avatar"
            />
          </>
        )}
      </div>
    </div>
  )
}
