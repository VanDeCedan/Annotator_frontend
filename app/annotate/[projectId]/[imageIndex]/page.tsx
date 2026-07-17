'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { TopNavbar } from '@/components/annotator/TopNavbar';
import { ClassPanel } from '@/components/annotator/ClassPanel';
import { OCRPanel } from '@/components/annotator/OCRPanel';
import { AnnotatorCanvas } from '@/components/annotator/AnnotatorCanvas';
import { useAnnotatorState } from '@/components/annotator/useAnnotatorState';

export default function AnnotatePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = Number(params.projectId);
  const initialIndex = Number(params.imageIndex) || 0;

  const sessionId = searchParams.get('session');
  const imageNamesStr = searchParams.get('images');
  const imageNames = imageNamesStr ? imageNamesStr.split(',') : [];

  const {
    currentIndex,
    currentImageName,
    projectType,
    classes,
    activeClassCode,
    setActiveClassCode,
    labels,
    setLabels,
    selectedLabelIndex,
    setSelectedLabelIndex,
    ocrValue,
    setOcrValue,
    prelabelStatus,
    isSaving,
    saveCurrent,
    nextImage,
    prevImage,
    skipImage,
    canNext,
    canPrev,
  } = useAnnotatorState(projectId, imageNames, initialIndex);

  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (!sessionId || !currentImageName) return;
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/projects/${projectId}/images/${sessionId}/${currentImageName}`;
    setImageUrl(url);

    const newUrl = `/annotate/${projectId}/${currentIndex}?session=${sessionId}&images=${imageNamesStr}`;
    window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);
  }, [currentIndex, currentImageName, sessionId, projectId]);

  const handleBack = async () => {
    await saveCurrent();
    router.push(`/annotator?project=${projectId}`);
  };

  if (!sessionId || imageNames.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EAEEF5]">
        <div className="bg-white border rounded shadow-md p-8 text-center">
          <p className="text-black font-medium mb-4">Invalid session. Please start from the project dashboard.</p>
          <button
            onClick={() => router.push('/projects')}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#EAEEF5] overflow-hidden">
      <TopNavbar
        title={`${currentImageName} (${currentIndex + 1} / ${imageNames.length})`}
        onSave={saveCurrent}
        onBack={handleBack}
        isSaving={isSaving}
      />

      {/* Prelabel status banner */}
      {prelabelStatus && (
        <div className="bg-green-50 text-green-800 px-4 py-2 text-sm text-center border-b border-green-200">
          {prelabelStatus}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 flex flex-col relative focus:outline-none" tabIndex={0}>
          {imageUrl ? (
            <AnnotatorCanvas
              imageUrl={imageUrl}
              projectType={projectType}
              labels={labels}
              onLabelsChange={setLabels}
              activeClassCode={activeClassCode}
              classes={classes}
              selectedLabelIndex={selectedLabelIndex}
              setSelectedLabelIndex={setSelectedLabelIndex}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-[#EAEEF5]">
              <svg className="animate-spin h-10 w-10 text-blue-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}

          {/* Navigation controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white border border-gray-300 px-4 py-2 rounded shadow text-black z-10">
            <button
              onClick={() => {
                if(window.confirm('Are you sure you want to delete all labels on this image?')) {
                  setLabels([]);
                  if (setSelectedLabelIndex) setSelectedLabelIndex(null);
                }
              }}
              className="px-2 py-1 bg-red-50 text-red-600 rounded border border-red-200 hover:bg-red-100 text-xs font-medium"
              title="Clear all labels on this image"
            >
              Clear All
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            
            <button
              onClick={prevImage}
              disabled={!canPrev}
              className={`p-1 rounded transition-colors ${canPrev ? 'hover:bg-gray-100 text-black' : 'text-gray-300 cursor-not-allowed'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold min-w-[70px] text-center">
              {currentIndex + 1} / {imageNames.length}
            </span>
            <button
              onClick={nextImage}
              disabled={!canNext}
              className={`p-1 rounded transition-colors ${canNext ? 'hover:bg-gray-100 text-black' : 'text-gray-300 cursor-not-allowed'}`}
              title="Save & Next"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            <button
              onClick={skipImage}
              disabled={!canNext}
              className={`px-2 py-1 rounded border transition-colors text-xs font-medium ${canNext ? 'bg-gray-50 border-gray-300 hover:bg-gray-200 text-gray-700' : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'}`}
              title="Skip without saving"
            >
              Skip
            </button>
          </div>
        </div>

        {/* Right panel */}
        {(projectType === 'Yolo' || projectType === 'Yolo OBB' || projectType === 'Classification') && (
          <ClassPanel
            classes={classes}
            activeClassCode={activeClassCode}
            onSelectClass={(code) => {
              setActiveClassCode(code);
              // If a box is selected, change its class!
              if (selectedLabelIndex !== null) {
                setLabels(prev => {
                  const newLabels = [...prev];
                  newLabels[selectedLabelIndex] = { ...newLabels[selectedLabelIndex], class_code: code };
                  return newLabels;
                });
              }
            }}
            projectType={projectType}
            selectedLabelIndex={selectedLabelIndex}
          />
        )}
        {projectType === 'Ocr' && (
          <OCRPanel value={ocrValue} onChange={setOcrValue} />
        )}
      </div>
    </div>
  );
}
