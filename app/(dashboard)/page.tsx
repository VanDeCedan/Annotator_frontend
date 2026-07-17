'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';

export default function HomePage() {
  const router = useRouter();
  const { user } = useAppStore();

  const actions = [
    {
      title: 'Projects',
      description: 'Create and manage your computer vision annotation projects.',
      icon: '📁',
      href: '/projects',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
    },
    {
      title: 'Classes',
      description: 'Define and customize annotation classes and colors for your projects.',
      icon: '🏷️',
      href: '/classes',
      color: 'bg-green-50 hover:bg-green-100 border-green-200',
    },
    {
      title: 'Pre-labels',
      description: 'Upload AI-generated pre-labels to speed up your annotation workflow.',
      icon: '⚡',
      href: '/prelabels',
      color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
    },
    {
      title: 'Annotator',
      description: 'Draw bounding boxes and tag classes directly on your images.',
      icon: '✏️',
      href: '/annotator',
      color: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
    },
    {
      title: 'Data set',
      description: 'Generate, split, augment, and export your final dataset for training.',
      icon: '📦',
      href: '/dataset',
      color: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 text-black">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome <span className="text-blue-600">{user?.name || 'User'}</span>!
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          This is your central annotator workspace for computer vision jobs. 
          Select what you want to do below to get started.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {actions.map((action) => (
          <button
            key={action.title}
            onClick={() => router.push(action.href)}
            className={`flex flex-col items-center text-center p-8 rounded-xl border transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${action.color}`}
          >
            <div className="text-5xl mb-4">{action.icon}</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{action.title}</h2>
            <p className="text-sm text-gray-600">{action.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
