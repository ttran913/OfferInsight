'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, User, GraduationCap, Code, Shield } from 'lucide-react';

type AccountData = {
  name: string | null;
  email: string | null;
  school: string | null;
  major: string | null;
  leetCodeUserName: string | null;
  expectedGraduationDate: string | null;
  loginMethods: string[];
};

const formatLoginMethod = (method: string) => {
  if (method === 'github') return 'GitHub';
  if (method === 'google') return 'Google';
  if (method === 'email') return 'Email';
  return method.charAt(0).toUpperCase() + method.slice(1);
};

const toDateInput = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    school: '',
    major: '',
    leetCodeUserName: '',
    expectedGraduationDate: '',
  });
  const [email, setEmail] = useState<string | null>(null);
  const [loginMethods, setLoginMethods] = useState<string[]>([]);

  useEffect(() => {
    const loadAccount = async () => {
      try {
        const response = await fetch('/api/users/account');
        if (!response.ok) {
          throw new Error('Failed to load account data');
        }
        const data = (await response.json()) as AccountData;
        setForm({
          name: data.name || '',
          school: data.school || '',
          major: data.major || '',
          leetCodeUserName: data.leetCodeUserName || '',
          expectedGraduationDate: toDateInput(data.expectedGraduationDate),
        });
        setEmail(data.email || null);
        setLoginMethods(data.loginMethods || []);
      } catch (error) {
        console.error('Error loading account page:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAccount();
  }, []);

  const loginMethodsText = useMemo(() => {
    if (!loginMethods.length) return 'Unknown';
    return loginMethods.map(formatLoginMethod).join(' + ');
  }, [loginMethods]);

  const handleChange = (field: keyof typeof form, value: string) => {
    setSaveMessage(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const response = await fetch('/api/users/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          expectedGraduationDate: form.expectedGraduationDate || null,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to save account data');
      }
      setSaveMessage('Saved');
    } catch (error) {
      console.error('Error saving account data:', error);
      setSaveMessage('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100dvh-var(--navbar-height))] bg-white text-gray-900 flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-lg p-8 w-full max-w-2xl">
          <div className="flex items-center justify-center py-20 text-gray-600">
            <Loader2 className="h-10 w-10 animate-spin text-electric-blue" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white text-gray-900 min-h-[calc(100dvh-var(--navbar-height))] w-full">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-4">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>

        <section className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Account</h1>
            <p className="text-gray-400 text-sm mt-1">Manage your profile and login details.</p>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-gray-900 font-semibold mb-2 text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-electric-blue" />
                Full Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-electric-blue focus:ring-2 focus:ring-electric-blue/50"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="block text-gray-900 font-semibold mb-2 text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-electric-blue" />
                Login Type
              </label>
              <div className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700">
                {loginMethodsText}
              </div>
              <p className="text-xs text-gray-500 mt-1">Current auth provider(s): {email || 'No email found'}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-900 font-semibold mb-2 text-sm flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-electric-blue" />
                  School
                </label>
                <input
                  type="text"
                  value={form.school}
                  onChange={(e) => handleChange('school', e.target.value)}
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-electric-blue focus:ring-2 focus:ring-electric-blue/50"
                  placeholder="School or university"
                />
              </div>
              <div>
                <label className="block text-gray-900 font-semibold mb-2 text-sm flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-electric-blue" />
                  Major / Field
                </label>
                <input
                  type="text"
                  value={form.major}
                  onChange={(e) => handleChange('major', e.target.value)}
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-electric-blue focus:ring-2 focus:ring-electric-blue/50"
                  placeholder="Major or field of study"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-900 font-semibold mb-2 text-sm flex items-center gap-2">
                  <Code className="w-4 h-4 text-electric-blue" />
                  LeetCode Username
                </label>
                <input
                  type="text"
                  value={form.leetCodeUserName}
                  onChange={(e) => handleChange('leetCodeUserName', e.target.value)}
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-electric-blue focus:ring-2 focus:ring-electric-blue/50"
                  placeholder="leetcode.com/u/your_handle"
                />
              </div>
              <div>
                <label className="block text-gray-900 font-semibold mb-2 text-sm flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-electric-blue" />
                  Expected Graduation Date
                </label>
                <input
                  type="date"
                  value={form.expectedGraduationDate}
                  onChange={(e) => handleChange('expectedGraduationDate', e.target.value)}
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-electric-blue focus:ring-2 focus:ring-electric-blue/50"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center gap-4">
              <button
                type="submit"
                disabled={saving}
                className="bg-electric-blue hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
              {saveMessage && (
                <span className={`text-sm ${saveMessage === 'Saved' ? 'text-green-600' : 'text-red-600'}`}>
                  {saveMessage}
                </span>
              )}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
