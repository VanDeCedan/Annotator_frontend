'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { getToken, removeToken, parseJwt } from '@/lib/auth';
import { Toast } from '@/components/ui/Toast';

const NAV_ITEMS_BASE = [
  {
    href: '/projects',
    label: 'Projects',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    href: '/classes',
    label: 'Classes',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },

  {
    href: '/annotator',
    label: 'Annotator',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
  },
  {
    href: '/dataset',
    label: 'Data set',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
  },
];

const NAV_ITEMS_ADMIN = [
  {
    href: '/users',
    label: 'Users',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, setUser } = useAppStore();
  const [isMounted, setIsMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Enforce authentication
    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }
    
    // Re-hydrate user state if missing (e.g., after page refresh)
    if (!user) {
      const payload = parseJwt(token);
      if (payload) {
        setUser({
          id: payload.sub,
          name: payload.name || payload.username,
          username: payload.username,
          role: payload.role,
          statut: 'activated'
        });
      } else {
        // Token is invalid or expired
        removeToken();
        router.push('/login');
      }
    }
  }, [router, user, setUser]);

  if (!isMounted) return null;

  const handleLogout = () => {
    removeToken();
    setUser(null);
    router.push('/login');
  };

  const navItems = [
    ...NAV_ITEMS_BASE,
    ...(user?.role === 'admin' ? NAV_ITEMS_ADMIN : []),
  ];

  return (
    <div className="min-h-screen flex bg-[#EAEEF5] text-black pt-16">
      <Toast />

      {/* Sidebar - gray-800 like ComPay */}
      <aside className={`fixed left-0 top-16 bottom-0 bg-gray-800 text-white flex flex-col transition-all duration-300 z-40 ${isCollapsed ? 'w-16' : 'w-64'}`}>
        {/* Sidebar Header */}
        <div className="p-4 flex items-center justify-between border-b border-gray-700">
          {!isCollapsed && (
            <h2 className="text-lg font-bold whitespace-nowrap">Features</h2>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded hover:bg-gray-700 transition-colors ml-auto"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 py-2 px-3 rounded hover:bg-gray-700 transition-all duration-200 ${isCollapsed ? 'justify-center' : ''} ${isActive ? 'bg-gray-700 font-bold' : 'text-gray-300 hover:text-white'}`}
                    title={item.label}
                  >
                    {item.icon}
                    {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main column */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isCollapsed ? 'ml-16' : 'ml-64'}`}>
        {/* Top header - gray-700 like ComPay */}
        <header className="fixed top-0 left-0 right-0 h-16 w-full bg-gray-700 text-white shadow p-4 flex items-center justify-between z-50">
          <h1 className="text-xl font-bold">CV Annotator</h1>

          {user && (
            <div className="flex items-center space-x-4">
              <span className="font-medium text-sm">
                Hello, {user.name} ({user.role})
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center text-sm bg-gray-600 hover:bg-gray-500 px-3 py-1.5 rounded transition"
                title="Logout"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 bg-[#EAEEF5] text-black overflow-y-auto">
          <div className="animate-fade-in-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
