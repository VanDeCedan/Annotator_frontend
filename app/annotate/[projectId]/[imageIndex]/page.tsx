'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { TopNavbar } from '@/components/annotator/TopNavbar';
import { ClassPanel } from '@/components/annotator/ClassPanel';
import { OCRPanel } from '@/components/annotator/OCRPanel';
import { AnnotatorCanvas } from '@/components/annotator/AnnotatorCanvas';
import { useAnnotatorState } from '@/components/annotator/useAnnotatorState';
import api from '@/lib/api';

export default function AnnotatePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = Number(params.projectId);
  const initialIndex = Number(params.imageIndex) || 0;

  const mode = searchParams.get('mode');
  const [imageNames, setImageNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [debugError, setDebugError] = useState<string>('');

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const imagesRes = await api.get(`/projects/${projectId}/images/local_workspace`);
        const allImages: string[] = imagesRes.data.image_names || [];

        const progressRes = await api.get(`/projects/${projectId}/labels/progress/`);
        const labeledImages: string[] = progressRes.data.labeled_images || [];

        if (mode === 'annotated') {
          setImageNames(allImages.filter(img => labeledImages.includes(img)));
        } else if (mode === 'unannotated') {
          setImageNames(allImages.filter(img => !labeledImages.includes(img)));
        } else {
          // Fallback to legacy URL passing
          const imageNamesStr = searchParams.get('images');
          setImageNames(imageNamesStr ? imageNamesStr.split(',') : allImages);
        }
      } catch (err: any) {
        console.error(err);
        setDebugError(err.message || String(err));
      } finally {
        setIsLoading(false);
      }
    };
    fetchImages();
  }, [projectId, mode, searchParams]);

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
    jumpToImage,
    canNext,
    canPrev,
    prelabelRotationEnabled,
    setPrelabelRotationEnabled,
    prelabelRotationOffset,
    setPrelabelRotationOffset,
    onImageLoaded
  } = useAnnotatorState(projectId, imageNames, initialIndex);

  const [imageUrl, setImageUrl] = useState('');
  const [rotationStep, setRotationStep] = useState(90);
  const [autoAdaptBox, setAutoAdaptBox] = useState(true);
  const [doubleClickRotationEnabled, setDoubleClickRotationEnabled] = useState(false);

  // Sidebar resizer state
  const [sidebarWidth, setSidebarWidth] = useState(288); // Default 288px (Tailwind w-72)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < window.innerWidth - 200) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizingSidebar(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    if (!currentImageName) return;
    // Hardcode local_workspace as the session
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/projects/${projectId}/images/local_workspace/${currentImageName}`;
    setImageUrl(url);

    const newUrl = `/annotate/${projectId}/${currentIndex}${mode ? `?mode=${mode}` : ''}`;
    window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);
  }, [currentIndex, currentImageName, projectId, mode]);

  // Global keyboard shortcuts for navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      if (e.key === 'Tab') {
        e.preventDefault(); // Prevent default focus switching
        if (e.shiftKey) {
          if (canPrev) prevImage();
        } else {
          if (canNext) nextImage();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canNext, canPrev, nextImage, prevImage]);

  const handleBack = async () => {
    await saveCurrent();
    router.push(`/annotator?project=${projectId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EAEEF5]">
        <svg className="animate-spin h-10 w-10 text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (imageNames.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EAEEF5]">
        <div className="bg-white border rounded shadow-md p-8 text-center">
          <p className="text-black font-medium mb-2">No images found for this session.</p>
          <p className="text-red-500 text-xs mb-4">Debug: Mode={mode}, ProjectId={projectId}. Error: {debugError || 'None'}</p>
          <button
            onClick={() => router.push(`/annotator?project=${projectId}`)}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Go to Project Dashboard
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

      <div className="flex flex-1 overflow-hidden" style={{ cursor: isResizingSidebar ? 'col-resize' : 'default' }}>
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
              rotationStep={rotationStep}
              autoAdaptBox={autoAdaptBox}
              doubleClickRotationEnabled={doubleClickRotationEnabled}
              onImageLoad={onImageLoaded}
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
            <div className="flex items-center gap-1 ml-2 border-l border-gray-300 pl-3">
              <span className="text-xs text-gray-500 font-medium">Jump:</span>
              <input 
                type="number" 
                min={1} 
                max={imageNames.length}
                placeholder="#"
                className="w-14 border border-gray-300 rounded px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseInt(e.currentTarget.value);
                    if (!isNaN(val) && val >= 1 && val <= imageNames.length) {
                       jumpToImage(val - 1);
                       e.currentTarget.value = '';
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Resizer Handle */}
        <div 
          onMouseDown={(e) => { e.preventDefault(); setIsResizingSidebar(true); }}
          className={`w-1 cursor-col-resize shrink-0 transition-colors border-l border-gray-300 ${isResizingSidebar ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-300'}`}
          style={{ zIndex: 50 }}
        />

        {/* Right panel wrapper */}
        <div className="flex flex-col h-full shrink-0 bg-white" style={{ width: sidebarWidth }}>
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
              labels={labels}
            />
          )}

          {/* Rotation step controls for Yolo OBB */}
          {projectType === 'Yolo OBB' && (
            <div className="w-full bg-white p-4 border-t border-gray-200 shadow-inner">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
                Arrow Key Rotation Step
              </label>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="number"
                  value={rotationStep}
                  onChange={(e) => setRotationStep(Number(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500 font-medium">deg</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer mt-3">
                <input
                  type="checkbox"
                  checked={autoAdaptBox}
                  onChange={(e) => setAutoAdaptBox(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700 font-medium">Auto-adapt box to angles</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer mt-3">
                <input
                  type="checkbox"
                  checked={doubleClickRotationEnabled}
                  onChange={(e) => setDoubleClickRotationEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700 font-medium">Enable double-click rotation</span>
              </label>

              <hr className="my-4 border-gray-200" />
              
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
                Pre-label Settings
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={prelabelRotationEnabled}
                  onChange={(e) => setPrelabelRotationEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700 font-medium">Apply angle offset</span>
              </label>

              {prelabelRotationEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={prelabelRotationOffset}
                    onChange={(e) => setPrelabelRotationOffset(Number(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-500 font-medium">deg</span>
                </div>
              )}
            </div>
          )}

          {projectType === 'Ocr' && (
            <OCRPanel 
              value={ocrValue} 
              onChange={setOcrValue} 
              onNext={canNext ? nextImage : undefined}
              onPrev={canPrev ? prevImage : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
