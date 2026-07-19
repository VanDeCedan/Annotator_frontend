'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';

export default function SessionDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = Number(params.projectId);
  const sessionId = searchParams.get('session');
  const imageNamesStr = searchParams.get('images');
  const imageNames = imageNamesStr ? imageNamesStr.split(',') : [];

  const [annotatedImages, setAnnotatedImages] = useState<string[]>([]);
  const [unannotatedImages, setUnannotatedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!projectId || imageNames.length === 0) return;

    const fetchProgress = async () => {
      try {
        const res = await api.get(`/projects/${projectId}/labels/progress/`);
        const labeledImages: string[] = res.data.labeled_images || [];
        
        const annotated = imageNames.filter(img => labeledImages.includes(img));
        const unannotated = imageNames.filter(img => !labeledImages.includes(img));
        
        setAnnotatedImages(annotated);
        setUnannotatedImages(unannotated);
      } catch (err) {
        console.error('Failed to fetch progress', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProgress();
  }, [projectId, imageNamesStr]);

  const handleStartAnnotation = (imagesSubset: string[]) => {
    if (imagesSubset.length === 0) return;
    const imgQuery = imagesSubset.join(',');
    router.push(`/annotate/${projectId}/0?session=${sessionId}&images=${encodeURIComponent(imgQuery)}`);
  };

  const handleBack = () => {
    router.push(`/annotator?project=${projectId}`);
  };

  if (!sessionId || imageNames.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EAEEF5]">
        <div className="bg-white border rounded shadow-md p-8 text-center">
          <p className="text-black font-medium mb-4">Invalid session. Please start from the project dashboard.</p>
          <Button onClick={() => router.push('/annotator')}>Go to Projects</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EAEEF5] text-black">
      {/* Top Navbar */}
      <div className="bg-white border-b shadow-sm px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={handleBack} className="text-gray-500 hover:text-black transition-colors" title="Back to Project">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="font-bold text-lg">Session Dashboard</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto py-10 px-4">
        <h2 className="text-2xl font-bold mb-2">Annotation Session Ready</h2>
        <p className="text-gray-600 mb-8">
          You uploaded {imageNames.length} image{imageNames.length !== 1 ? 's' : ''}. Choose a group below to start annotating.
        </p>

        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Unannotated Card */}
            <div 
              onClick={() => handleStartAnnotation(unannotatedImages)}
              className={`bg-white border rounded-xl shadow-sm p-6 flex flex-col items-center text-center transition-all ${
                unannotatedImages.length > 0 
                  ? 'cursor-pointer hover:shadow-md hover:border-blue-300 hover:-translate-y-1' 
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-1">Unannotated Images</h3>
              <p className="text-gray-500 text-sm mb-4">Images that need labels</p>
              <div className="mt-auto">
                <span className="inline-block bg-blue-100 text-blue-800 text-2xl font-bold px-4 py-1 rounded-full">
                  {unannotatedImages.length}
                </span>
              </div>
            </div>

            {/* Annotated Card */}
            <div 
              onClick={() => handleStartAnnotation(annotatedImages)}
              className={`bg-white border rounded-xl shadow-sm p-6 flex flex-col items-center text-center transition-all ${
                annotatedImages.length > 0 
                  ? 'cursor-pointer hover:shadow-md hover:border-green-300 hover:-translate-y-1' 
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-1">Annotated Images</h3>
              <p className="text-gray-500 text-sm mb-4">Review or correct existing labels</p>
              <div className="mt-auto">
                <span className="inline-block bg-green-100 text-green-800 text-2xl font-bold px-4 py-1 rounded-full">
                  {annotatedImages.length}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
