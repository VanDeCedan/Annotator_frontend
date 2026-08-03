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
    prelabelWidthAdjustEnabled,
    setPrelabelWidthAdjustEnabled,
    prelabelWidthAdjustAction,
    setPrelabelWidthAdjustAction,
    prelabelWidthAdjustAmount,
    setPrelabelWidthAdjustAmount,
    prelabelWidthAdjustSide,
    setPrelabelWidthAdjustSide,
    prelabelWidthAdjustClasses,
    setPrelabelWidthAdjustClasses,
    onImageLoaded,
    markEmptyAndNext,
    boxImageNames,
    autoAddBoxImageEnabled,
    setAutoAddBoxImageEnabled,
    boxImageDefaultClass,
    setBoxImageDefaultClass,
    boxImageDefaultWidth,
    setBoxImageDefaultWidth,
    boxImageDefaultHeight,
    setBoxImageDefaultHeight,
    addRandomBoxImage
  } = useAnnotatorState(projectId, imageNames, initialIndex);

  const [imageUrl, setImageUrl] = useState('');
  const [rotationStep, setRotationStep] = useState(90);
  const [autoAdaptBox, setAutoAdaptBox] = useState(true);
  const [doubleClickRotationEnabled, setDoubleClickRotationEnabled] = useState(false);
  const [inheritFirstBoxAngle, setInheritFirstBoxAngle] = useState(false);
  const [zoomToAreaEnabled, setZoomToAreaEnabled] = useState(false);
  const [autoAdvanceClass, setAutoAdvanceClass] = useState(false);

  // Advance to the next class in sorted order after each annotation
  const handleAnnotationAdded = () => {
    if (!autoAdvanceClass || classes.length < 2) return;
    setActiveClassCode((prev) => {
      const sorted = [...classes].sort((a, b) => a.code - b.code);
      const idx = sorted.findIndex((c) => c.code === prev);
      const next = sorted[(idx + 1) % sorted.length];
      return next.code;
    });
  };

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
              projectId={projectId}
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
              inheritFirstBoxAngle={inheritFirstBoxAngle}
              zoomToAreaEnabled={zoomToAreaEnabled}
              setZoomToAreaEnabled={setZoomToAreaEnabled}
              onImageLoad={onImageLoaded}
              onAnnotationAdded={handleAnnotationAdded}
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
            {(projectType === 'Yolo' || projectType === 'Yolo OBB') && (
              <button
                onClick={() => {
                  if(window.confirm('Mark this image as background (empty) and go to next?')) {
                    markEmptyAndNext();
                  }
                }}
                className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded border border-yellow-200 hover:bg-yellow-100 text-xs font-medium whitespace-nowrap"
                title="Mark image as empty background and go next"
              >
                Mark Empty
              </button>
            )}
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
        <div className="flex flex-col h-full shrink-0 bg-white overflow-y-auto" style={{ width: sidebarWidth }}>
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

          {projectType === 'Ocr' && (
            <OCRPanel 
              value={ocrValue} 
              onChange={setOcrValue} 
              onNext={canNext ? nextImage : undefined}
              onPrev={canPrev ? prevImage : undefined}
            />
          )}

          {/* Annotation Tools — merged below Classes in the right sidebar */}
          {(projectType === 'Yolo' || projectType === 'Yolo OBB') && (
            <div className="w-full p-4 border-t border-gray-200">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
                Annotation Tools
              </label>

              {/* Auto-advance class */}
              <label className={`flex items-center gap-2.5 cursor-pointer p-2.5 rounded-lg border transition-all mb-3 ${
                autoAdvanceClass
                  ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm'
                  : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
              }`}>
                <input
                  type="checkbox"
                  checked={autoAdvanceClass}
                  onChange={(e) => setAutoAdvanceClass(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">Auto-advance class</span>
                  <span className="text-[11px] text-gray-500 font-normal">Next annotation uses the next class</span>
                </div>
              </label>

              {/* Boxes Images Tools Section */}
              <hr className="my-3 border-gray-200" />
              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl mb-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-purple-900 uppercase tracking-wider block">
                    Boxes Images Overlay
                  </label>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                    {boxImageNames.length} Assets
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => addRandomBoxImage()}
                  disabled={boxImageNames.length === 0}
                  className={`w-full py-2 px-3 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 border transition-all mb-2.5 ${
                    boxImageNames.length > 0
                      ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600 shadow-sm cursor-pointer'
                      : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  }`}
                  title={boxImageNames.length === 0 ? 'Upload box images in Project Setup first' : 'Add random box image on canvas'}
                >
                  🖼️ Add Random Box Image
                </button>

                <label className={`flex items-start gap-2 cursor-pointer p-2 rounded-lg border transition-all mb-2.5 ${
                  autoAddBoxImageEnabled
                    ? 'bg-purple-100 border-purple-400 text-purple-900 font-medium'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}>
                  <input
                    type="checkbox"
                    checked={autoAddBoxImageEnabled}
                    onChange={(e) => setAutoAddBoxImageEnabled(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 shrink-0"
                  />
                  <div className="flex flex-col text-xs">
                    <span className="font-bold">Auto-add on Next Image</span>
                    <span className="text-[10px] text-gray-500 font-normal">Places a random box image on next images until unchecked</span>
                  </div>
                </label>

                {/* Default Box Image Settings */}
                <div className="pt-2 border-t border-purple-200/80 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="font-semibold text-gray-700 text-[11px]">Default Class:</label>
                    <select
                      value={boxImageDefaultClass !== null ? boxImageDefaultClass : (activeClassCode ?? '')}
                      onChange={(e) => setBoxImageDefaultClass(e.target.value !== '' ? Number(e.target.value) : null)}
                      className="border border-gray-300 rounded px-1.5 py-0.5 text-xs text-black bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 max-w-[120px]"
                    >
                      {classes.map(c => (
                        <option key={c.code} value={c.code}>{c.label || `Class ${c.code}`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-gray-700 text-[11px]">Default Size (px):</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={10}
                        max={2000}
                        value={boxImageDefaultWidth}
                        onChange={(e) => setBoxImageDefaultWidth(Number(e.target.value) || 50)}
                        className="w-12 border border-gray-300 rounded px-1 py-0.5 text-center text-xs text-black"
                        title="Width in pixels"
                      />
                      <span className="text-gray-400">×</span>
                      <input
                        type="number"
                        min={10}
                        max={2000}
                        value={boxImageDefaultHeight}
                        onChange={(e) => setBoxImageDefaultHeight(Number(e.target.value) || 50)}
                        className="w-12 border border-gray-300 rounded px-1 py-0.5 text-center text-xs text-black"
                        title="Height in pixels"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {projectType === 'Yolo OBB' && (
                <>
                  <hr className="my-3 border-gray-200" />
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

                  <label className="flex items-center gap-2 cursor-pointer mt-3">
                    <input
                      type="checkbox"
                      checked={inheritFirstBoxAngle}
                      onChange={(e) => setInheritFirstBoxAngle(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700 font-medium">Inherit first box angle</span>
                  </label>

                  <hr className="my-4 border-gray-200" />
                </>
              )}

              {/* Pre-label Settings Section */}
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
                Pre-label Settings
              </label>

              {projectType === 'Yolo OBB' && (
                <div className="mb-3">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={prelabelRotationEnabled}
                      onChange={(e) => setPrelabelRotationEnabled(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 font-medium">Apply angle offset</span>
                  </label>

                  {prelabelRotationEnabled && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={prelabelRotationOffset}
                        onChange={(e) => setPrelabelRotationOffset(Number(e.target.value) || 0)}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-500 font-medium">deg</span>
                    </div>
                  )}
                </div>
              )}

              {/* Width Adjustment Control */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prelabelWidthAdjustEnabled}
                    onChange={(e) => setPrelabelWidthAdjustEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-semibold text-gray-800">Adjust Pre-label Width</span>
                </label>

                {prelabelWidthAdjustEnabled && (
                  <div className="mt-3 flex flex-col gap-3 pt-2 border-t border-gray-200 text-xs">
                    {/* Action Selector (Reduce / Increase) */}
                    <div>
                      <label className="block text-gray-600 font-semibold mb-1">Action:</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPrelabelWidthAdjustAction('reduce')}
                          className={`py-1 px-2 rounded font-medium text-center border transition-all ${
                            prelabelWidthAdjustAction === 'reduce'
                              ? 'bg-red-50 border-red-400 text-red-700 font-bold'
                              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          📉 Reduce
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrelabelWidthAdjustAction('increase')}
                          className={`py-1 px-2 rounded font-medium text-center border transition-all ${
                            prelabelWidthAdjustAction === 'increase'
                              ? 'bg-green-50 border-green-400 text-green-700 font-bold'
                              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          📈 Increase
                        </button>
                      </div>
                    </div>

                    {/* Percentage / Integer (Max 90) */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-gray-600 font-semibold">Adjustment Amount:</label>
                        <span className="font-bold text-blue-600">{prelabelWidthAdjustAmount}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={prelabelWidthAdjustAmount}
                          onChange={(e) => {
                            const val = Math.min(90, Math.max(1, Number(e.target.value) || 1));
                            setPrelabelWidthAdjustAmount(val);
                          }}
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm font-semibold text-black focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-gray-500 text-[11px]">(1% - 90% max)</span>
                      </div>
                    </div>

                    {/* Side selection (Both / Left / Right) */}
                    <div>
                      <label className="block text-gray-600 font-semibold mb-1">Apply Side:</label>
                      <div className="grid grid-cols-3 gap-1">
                        {(['both', 'left', 'right'] as const).map((side) => (
                          <button
                            key={side}
                            type="button"
                            onClick={() => setPrelabelWidthAdjustSide(side)}
                            className={`py-1 px-1 capitalize rounded font-medium text-[11px] text-center border transition-all ${
                              prelabelWidthAdjustSide === side
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {side === 'both' ? '↔ Both' : side === 'left' ? '← Left' : 'Right →'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Target Classes Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-gray-600 font-semibold">Target Classes:</label>
                        <button
                          type="button"
                          onClick={() => {
                            if (prelabelWidthAdjustClasses.length === classes.length) {
                              setPrelabelWidthAdjustClasses([]);
                            } else {
                              setPrelabelWidthAdjustClasses(classes.map(c => c.code));
                            }
                          }}
                          className="text-[10px] text-blue-600 hover:underline font-semibold"
                        >
                          {prelabelWidthAdjustClasses.length === classes.length ? 'Clear All' : 'Select All'}
                        </button>
                      </div>
                      <div className="max-h-36 overflow-y-auto border border-gray-200 rounded bg-white p-1.5 space-y-1">
                        {classes.length === 0 ? (
                          <p className="text-[11px] text-gray-400 italic">No classes available</p>
                        ) : (
                          classes.map(cls => {
                            const isChecked = prelabelWidthAdjustClasses.includes(cls.code);
                            return (
                              <label
                                key={cls.code}
                                className={`flex items-center gap-2 p-1 rounded cursor-pointer transition-colors ${
                                  isChecked ? 'bg-blue-50/80' : 'hover:bg-gray-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setPrelabelWidthAdjustClasses(prev => [...prev, cls.code]);
                                    } else {
                                      setPrelabelWidthAdjustClasses(prev => prev.filter(c => c !== cls.code));
                                    }
                                  }}
                                  className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300"
                                />
                                <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: cls.color || '#3b82f6' }} />
                                <span className="truncate text-[11px] font-medium text-gray-800">{cls.name || `Class ${cls.code}`}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
