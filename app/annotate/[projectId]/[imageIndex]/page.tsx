'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { TopNavbar } from '@/components/annotator/TopNavbar';
import { ClassPanel } from '@/components/annotator/ClassPanel';
import { OCRPanel } from '@/components/annotator/OCRPanel';
import { VLMPanel } from '@/components/annotator/VLMPanel';
import { AnnotatorCanvas } from '@/components/annotator/AnnotatorCanvas';
import { NERAnnotator } from '@/components/annotator/NERAnnotator';
import { useAnnotatorState } from '@/components/annotator/useAnnotatorState';
import api from '@/lib/api';

export default function AnnotatePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = Number(params.projectId);
  const initialIndex = Number(params.imageIndex) || 0;

  const mode = searchParams.get('mode');
  const startImage = searchParams.get('startImage'); // specific image to jump to
  const [imageNames, setImageNames] = useState<string[]>([]);
  const [resolvedIndex, setResolvedIndex] = useState(initialIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [debugError, setDebugError] = useState<string>('');

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const imagesRes = await api.get(`/projects/${projectId}/images/local_workspace`);
        const allImages: string[] = imagesRes.data.image_names || [];

        const progressRes = await api.get(`/projects/${projectId}/labels/progress/`);
        const labeledImages: string[] = progressRes.data.labeled_images || [];
        const skippedImages: string[] = progressRes.data.skipped_images || [];

        let names: string[] = [];
        if (mode === 'annotated') {
          names = allImages.filter(img => labeledImages.includes(img));
        } else if (mode === 'unannotated') {
          names = allImages.filter(img => !labeledImages.includes(img) && !skippedImages.includes(img));
        } else if (mode === 'skipped') {
          names = allImages.filter(img => skippedImages.includes(img));
        } else {
          // Fallback to legacy URL passing
          const imageNamesStr = searchParams.get('images');
          names = imageNamesStr ? imageNamesStr.split(',') : allImages;
        }

        setImageNames(names);

        // If a specific image was requested, find its index in the ordered list
        if (startImage) {
          const idx = names.indexOf(startImage);
          setResolvedIndex(idx >= 0 ? idx : 0);
        } else {
          setResolvedIndex(initialIndex);
        }
      } catch (err: any) {
        console.error(err);
        setDebugError(err.message || String(err));
      } finally {
        setIsLoading(false);
      }
    };
    fetchImages();
  }, [projectId, mode, searchParams, startImage, initialIndex]);

  const [prefixEnabled, setPrefixEnabled] = useState(false);
  const [prefixValue, setPrefixValue] = useState('');

  const {
    currentIndex,
    currentImageName,
    projectType,
    classes,
    activeClassCode,
    setActiveClassCode,
    labels,
    setLabels,
    selectedLabelIndices,
    setSelectedLabelIndices,
    ocrValue,
    setOcrValue,
    vlmValues,
    setVlmValues,
    deskewAngle,
    setDeskewAngle,
    deskewCrop,
    setDeskewCrop,
    prelabelStatus,
    isSaving,
    saveCurrent,
    nextImage,
    prevImage,
    skipImage,
    deleteImage,
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
    addRandomBoxImage,
    ocrCharset,
    runDbnetDetection,
    runParseqOcr,
    runLivePrediction,
    isAiLoading,
    dbnetModelPath,
    ocrEnableClass,
    autoPredictEnabled,
    setAutoPredictEnabled,
    ocrConf,
    setOcrConf,
    iouThresh,
    setIouThresh,
    maintainPrevious,
    setMaintainPrevious,
  } = useAnnotatorState(projectId, imageNames, resolvedIndex, prefixEnabled, prefixValue);

  const [imageUrl, setImageUrl] = useState('');
  const [rotationStep, setRotationStep] = useState(90);
  const [autoAdaptBox, setAutoAdaptBox] = useState(true);
  const [doubleClickRotationEnabled, setDoubleClickRotationEnabled] = useState(false);
  const [inheritFirstBoxAngle, setInheritFirstBoxAngle] = useState(false);
  const [zoomToAreaEnabled, setZoomToAreaEnabled] = useState(false);
  const [autoAdvanceClass, setAutoAdvanceClass] = useState(false);
  const [dbnetThresh, setDbnetThresh] = useState(0.7);
  const [parseqMinConf, setParseqMinConf] = useState(0.5);
  const [aiThresh, setAiThresh] = useState(0.25);
  const [vlmZoom, setVlmZoom] = useState(1);
  const [vlmTransformOrigin, setVlmTransformOrigin] = useState('center center');
  const [vlmPan, setVlmPan] = useState({ x: 0, y: 0 });
  const [isVlmDragging, setIsVlmDragging] = useState(false);
  const [vlmDragStart, setVlmDragStart] = useState({ x: 0, y: 0 });
  const vlmViewerRef = useRef<HTMLDivElement>(null);

  // Prevent default Wheel globally to stop page zoom/scroll when over VLM viewer
  // Also handle Escape to fit to page
  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (projectType !== 'VLM') return;
      
      const viewer = vlmViewerRef.current;
      if (!viewer || !viewer.contains(e.target as Node)) return;

      e.preventDefault(); // Stop entire page from zooming or scrolling
      if (e.ctrlKey) {
        setVlmZoom(prev => {
          const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
          return Math.min(10, Math.max(0.1, prev * zoomFactor));
        });
      } else {
        if (e.shiftKey) {
          setVlmPan(prev => ({ ...prev, x: prev.x - e.deltaY }));
        } else {
          setVlmPan(prev => ({ ...prev, y: prev.y - e.deltaY }));
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (projectType === 'VLM' && e.key === 'Escape') {
        setVlmZoom(1);
        setVlmTransformOrigin('center center');
        setVlmPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [projectType]);


  // Reset zoom when changing images in VLM mode
  useEffect(() => {
    if (projectType === 'VLM') {
      setVlmZoom(1);
      setVlmTransformOrigin('center center');
      setVlmPan({ x: 0, y: 0 });
    }
  }, [currentIndex, projectType]);

  // Crop state
  const [isCropping, setIsCropping] = useState(false);
  const [cropStart, setCropStart] = useState<{x: number, y: number} | null>(null);

  const handleCropPointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (projectType !== 'Deskewer') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCropStart({ x, y });
    setIsCropping(true);
    setDeskewCrop({ x, y, w: 0, h: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!isCropping || !cropStart || projectType !== 'Deskewer') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const currentY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const x = Math.min(cropStart.x, currentX);
    const y = Math.min(cropStart.y, currentY);
    const w = Math.abs(currentX - cropStart.x);
    const h = Math.abs(currentY - cropStart.y);

    setDeskewCrop({ x, y, w, h });
  };

  const handleCropPointerUp = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!isCropping || projectType !== 'Deskewer') return;
    setIsCropping(false);
    setCropStart(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    // If the crop box is too small, just clear it
    if (deskewCrop && (deskewCrop.w < 0.01 || deskewCrop.h < 0.01)) {
        setDeskewCrop(null);
    }
  };

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

  // Reset class to the first class when moving to a new image if autoAdvanceClass is enabled
  useEffect(() => {
    if (autoAdvanceClass && classes.length > 0 && (projectType === 'Yolo' || projectType === 'Yolo OBB')) {
      const sorted = [...classes].sort((a, b) => a.code - b.code);
      setActiveClassCode(sorted[0].code);
    }
  }, [currentIndex, autoAdvanceClass, classes, projectType, setActiveClassCode]);

  // Sidebar resizer state
  const [sidebarWidth, setSidebarWidth] = useState(450); // Default 450px
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

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

      if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        deleteImage();
      }

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        skipImage();
      }

      if (projectType === 'Deskewer') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setDeskewAngle((prev: number) => prev + rotationStep);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setDeskewAngle((prev: number) => prev - rotationStep);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canNext, canPrev, nextImage, prevImage, deleteImage, skipImage, projectType, rotationStep, setDeskewAngle]);

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
          <p className="text-black font-medium mb-2">No {projectType === 'NER' ? 'texts' : 'images'} found for this session.</p>
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

        {/* Left Sidebar: Annotation Tools */}
        {(projectType === 'Yolo' || projectType === 'Yolo OBB' || projectType === 'KIE' || projectType === 'NER' || projectType === 'VLM') && (
          <div className={`relative shrink-0 bg-white border-r border-gray-200 flex flex-col h-full z-10 shadow-xs transition-all duration-200 ${isLeftSidebarOpen ? 'w-80' : 'w-0'}`}>
            <button
              onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
              className="absolute -right-4 top-1/2 -translate-y-1/2 w-4 h-16 bg-white border border-gray-300 rounded-r-md flex items-center justify-center hover:bg-gray-50 z-50 text-gray-500 shadow"
              style={{ right: '-16px' }}
              title="Toggle Left Sidebar"
            >
              {isLeftSidebarOpen ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              )}
            </button>
            <div className={`flex flex-col h-full w-80 overflow-y-auto p-4 ${!isLeftSidebarOpen && 'hidden'}`}>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
              Annotation Tools
            </label>

            {/* Auto-advance class */}
            {projectType !== 'VLM' && (
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
            )}

            {/* Maintain Previous Information (VLM Only) */}
            {projectType === 'VLM' && (
              <label className={`flex items-center gap-2.5 cursor-pointer p-2.5 rounded-lg border transition-all mb-3 ${
                maintainPrevious
                  ? 'bg-green-50 border-green-500 text-green-700 shadow-sm'
                  : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
              }`}>
                <input
                  type="checkbox"
                  checked={maintainPrevious}
                  onChange={(e) => setMaintainPrevious(e.target.checked)}
                  className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">Maintain previous</span>
                  <span className="text-[11px] text-gray-500 font-normal">Keep texts from previous image when advancing</span>
                </div>
              </label>
            )}

            {/* AI Tools Section for KIE (only shown if dbnetModelPath is provided) */}
            {projectType === 'KIE' && dbnetModelPath && (
              <>
                <hr className="my-3 border-gray-200" />
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl mb-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-indigo-900 uppercase tracking-wider block">
                      AI Assist
                    </label>
                  </div>
                  
                  <div className="mb-3 space-y-2">
                    <div className="flex flex-col">
                      <div className="flex justify-between">
                        <label className="text-[10px] font-semibold text-indigo-800">DBNet Conf: {dbnetThresh}</label>
                      </div>
                      <input type="range" min="0.1" max="1.0" step="0.05" value={dbnetThresh} onChange={(e) => setDbnetThresh(parseFloat(e.target.value))} className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer" />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => runDbnetDetection(dbnetThresh)}
                    disabled={isAiLoading}
                    className="w-full py-2 px-3 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 border bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    🎯 DBNet Auto-Detect
                  </button>
                </div>
              </>
            )}

            {/* AI Assist for YOLO / YOLO OBB */}
            {(projectType === 'Yolo' || projectType === 'Yolo OBB') && dbnetModelPath && (
              <>
                <hr className="my-3 border-gray-200" />
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl mb-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-indigo-900 uppercase tracking-wider block">
                      AI Assist
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] text-indigo-700 font-bold cursor-pointer uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={autoPredictEnabled}
                        onChange={(e) => setAutoPredictEnabled(e.target.checked)}
                        className="w-3 h-3 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Auto
                    </label>
                  </div>
                  
                  <div className="mb-3 space-y-2">
                    <div className="flex flex-col mb-2">
                      <div className="flex justify-between">
                        <label className="text-[10px] font-semibold text-indigo-800">Min Conf: {ocrConf}</label>
                      </div>
                      <input 
                        type="range" 
                        min="0.05" 
                        max="1.0" 
                        step="0.05" 
                        value={ocrConf} 
                        onChange={(e) => setOcrConf(parseFloat(e.target.value))} 
                        className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer" 
                      />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex justify-between">
                        <label className="text-[10px] font-semibold text-indigo-800">IOU: {iouThresh}</label>
                      </div>
                      <input 
                        type="range" 
                        min="0.05" 
                        max="1.0" 
                        step="0.05" 
                        value={iouThresh} 
                        onChange={(e) => setIouThresh(parseFloat(e.target.value))} 
                        className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer" 
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => runLivePrediction(ocrConf, iouThresh)}
                    disabled={isAiLoading}
                    className="w-full py-2 px-3 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 border bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isAiLoading ? 'Predicting...' : '🎯 AI Predict'}
                  </button>
                </div>
              </>
            )}

            {/* Boxes Images Tools Section */}
            {(projectType === 'Yolo' || projectType === 'Yolo OBB') && (
              <>
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
              </>
            )}


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
            {projectType !== 'NER' && (
              <>
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
              </>
            )}
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 flex flex-col focus:outline-none min-w-0" tabIndex={0}>
          <div className="flex-1 flex flex-col relative min-h-0">
          {imageUrl ? (
            projectType === 'Deskewer' ? (
              <div className="flex-1 flex items-center justify-center overflow-hidden bg-[#2C2C2C] relative">
                <div style={{ transform: `rotate(${deskewAngle}deg)`, transition: 'transform 0.1s ease-out', position: 'relative', display: 'inline-block' }}>
                  <img 
                    src={imageUrl} 
                    alt="Deskewer" 
                    draggable={false}
                    className="object-contain"
                    style={{ maxHeight: '90vh', maxWidth: '90vw' }}
                    onPointerDown={handleCropPointerDown}
                    onPointerMove={handleCropPointerMove}
                    onPointerUp={handleCropPointerUp}
                  />
                  {deskewCrop && (
                    <div style={{
                      position: 'absolute',
                      border: '2px solid #00ff00',
                      backgroundColor: 'rgba(0, 255, 0, 0.2)',
                      left: `${deskewCrop.x * 100}%`,
                      top: `${deskewCrop.y * 100}%`,
                      width: `${deskewCrop.w * 100}%`,
                      height: `${deskewCrop.h * 100}%`,
                      pointerEvents: 'none'
                    }}>
                      <div className="absolute top-0 left-0 bg-green-500 text-white text-[10px] px-1 font-mono">Crop Area</div>
                    </div>
                  )}
                </div>
              </div>
            ) : projectType === 'NER' ? (
              <NERAnnotator
                fileUrl={imageUrl}
                labels={labels}
                onLabelsChange={setLabels}
                activeClassCode={activeClassCode}
                classes={classes}
                selectedLabelIndices={selectedLabelIndices}
                setSelectedLabelIndices={setSelectedLabelIndices}
                setActiveClassCode={setActiveClassCode}
                onAnnotationAdded={handleAnnotationAdded}
              />
            ) : projectType === 'VLM' ? (
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Image viewer with Ctrl+Wheel zoom */}
                <div
                  ref={vlmViewerRef}
                  className="flex-1 flex items-center justify-center overflow-hidden bg-[#2C2C2C] p-4 relative"
                  style={{ cursor: isVlmDragging ? 'grabbing' : 'grab' }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    setIsVlmDragging(true);
                    setVlmDragStart({ x: e.clientX - vlmPan.x, y: e.clientY - vlmPan.y });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!isVlmDragging) return;
                    setVlmPan({ x: e.clientX - vlmDragStart.x, y: e.clientY - vlmDragStart.y });
                  }}
                  onPointerUp={(e) => {
                    setIsVlmDragging(false);
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }}
                  onPointerCancel={(e) => {
                    setIsVlmDragging(false);
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }}
                >
                  <img
                    src={imageUrl}
                    alt={currentImageName}
                    draggable={false}
                    className="object-contain rounded shadow-lg transition-transform duration-100"
                    style={{
                      maxHeight: vlmZoom === 1 ? '85vh' : undefined,
                      maxWidth: vlmZoom === 1 ? '100%' : undefined,
                      transform: `translate(${vlmPan.x}px, ${vlmPan.y}px) scale(${vlmZoom})`,
                      transformOrigin: vlmTransformOrigin,
                    }}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      onImageLoaded(img.naturalWidth, img.naturalHeight);
                    }}
                    onDoubleClick={(e) => {
                      if (vlmZoom >= 4.9) {
                        setVlmZoom(1);
                        setVlmTransformOrigin('center center');
                      } else {
                        const x = (e.nativeEvent.offsetX / e.currentTarget.offsetWidth) * 100;
                        const y = (e.nativeEvent.offsetY / e.currentTarget.offsetHeight) * 100;
                        setVlmTransformOrigin(`${x}% ${y}%`);
                        setVlmZoom(prev => Math.min(5, Math.round((prev + 0.1) * 10) / 10));
                      }
                    }}
                  />
                  {/* Zoom indicator */}
                  {vlmZoom !== 1 && (
                    <div className="absolute bottom-3 left-3 bg-black/60 text-white text-[11px] font-mono px-2 py-1 rounded pointer-events-none">
                      {Math.round(vlmZoom * 100)}% &nbsp;
                      <span className="text-gray-300 text-[10px]">dbl-click to reset</span>
                    </div>
                  )}
                  {/* Zoom hint (shown at 100%) */}
                  {vlmZoom === 1 && (
                    <div className="absolute bottom-3 left-3 bg-black/40 text-gray-300 text-[10px] px-2 py-1 rounded pointer-events-none select-none">
                      Ctrl+Scroll to zoom
                    </div>
                  )}
                </div>
                {/* VLM annotation panel resizer */}
                {isRightSidebarOpen && (
                  <div 
                    onMouseDown={(e) => { e.preventDefault(); setIsResizingSidebar(true); }}
                    className={`w-1 cursor-col-resize shrink-0 transition-colors border-l border-gray-300 ${isResizingSidebar ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-300'}`}
                    style={{ zIndex: 50 }}
                  />
                )}
                {/* VLM annotation panel */}
                <div 
                  className="relative shrink-0 border-l border-gray-200 flex flex-col overflow-hidden transition-all duration-200 bg-white"
                  style={{ width: isRightSidebarOpen ? sidebarWidth : 0 }}
                >
                  <button
                    onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                    className="absolute -left-4 top-1/2 -translate-y-1/2 w-4 h-16 bg-white border border-gray-300 rounded-l-md flex items-center justify-center hover:bg-gray-50 z-50 text-gray-500 shadow"
                    style={{ left: '-16px' }}
                    title="Toggle Right Sidebar"
                  >
                    {isRightSidebarOpen ? (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    )}
                  </button>
                  
                  <div className={`flex flex-col h-full w-full ${!isRightSidebarOpen ? 'hidden' : ''}`}>
                    <VLMPanel
                      classes={classes}
                      values={vlmValues}
                      onChange={(code, val) => setVlmValues(prev => ({ ...prev, [code]: val }))}
                      onNext={nextImage}
                      onPrev={prevImage}
                    />
                    {/* VLM nav bar */}
                    <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-2 flex items-center justify-between gap-2">
                      <button
                        onClick={prevImage}
                        disabled={!canPrev}
                        className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${canPrev ? 'bg-white border-gray-300 hover:bg-gray-100 text-black' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}
                      >
                        ← Prev
                      </button>
                      <span className="text-xs text-gray-500 font-medium">{currentIndex + 1} / {imageNames.length}</span>
                      <button
                        onClick={skipImage}
                        disabled={!canNext}
                        className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${canNext ? 'bg-white border-yellow-300 hover:bg-yellow-50 text-yellow-700' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}
                      >
                        Skip
                      </button>
                      <button
                        onClick={nextImage}
                        disabled={!canNext}
                        className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${canNext ? 'bg-blue-600 border-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}
                      >
                        Save & Next →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <AnnotatorCanvas
                projectId={projectId}
                imageUrl={imageUrl}
                projectType={projectType}
                labels={labels}
                onLabelsChange={setLabels}
                activeClassCode={activeClassCode}
                classes={classes}
                selectedLabelIndices={selectedLabelIndices}
                setSelectedLabelIndices={setSelectedLabelIndices}
                rotationStep={rotationStep}
                autoAdaptBox={autoAdaptBox}
                doubleClickRotationEnabled={doubleClickRotationEnabled}
                inheritFirstBoxAngle={inheritFirstBoxAngle}
                zoomToAreaEnabled={zoomToAreaEnabled}
                setZoomToAreaEnabled={setZoomToAreaEnabled}
                onImageLoad={onImageLoaded}
                onAnnotationAdded={handleAnnotationAdded}
              />
            )
          ) : (
            <div className="flex-1 flex items-center justify-center bg-[#EAEEF5]">
              <svg className="animate-spin h-10 w-10 text-blue-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
          
          {/* Navigation controls — vertical strip for NER, horizontal bottom bar for others */}
          {projectType === 'NER' ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 bg-white border border-gray-300 px-2 py-3 rounded-lg shadow-md text-black z-10">
              {/* Prev */}
              <button
                onClick={prevImage}
                disabled={!canPrev}
                className={`p-1.5 rounded transition-colors ${canPrev ? 'hover:bg-gray-100 text-black' : 'text-gray-300 cursor-not-allowed'}`}
                title="Previous"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
              </button>
              {/* Counter */}
              <span className="text-[10px] font-bold text-gray-600 text-center leading-tight">
                {currentIndex + 1}<br/><span className="text-gray-400 font-normal">/{imageNames.length}</span>
              </span>
              {/* Next */}
              <button
                onClick={nextImage}
                disabled={!canNext}
                className={`p-1.5 rounded transition-colors ${canNext ? 'hover:bg-gray-100 text-black' : 'text-gray-300 cursor-not-allowed'}`}
                title="Save & Next"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>

              <div className="w-full h-px bg-gray-200 my-0.5" />

              {/* Jump */}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] text-gray-400 font-medium uppercase">Jump</span>
                <input
                  type="number"
                  min={1}
                  max={imageNames.length}
                  placeholder="#"
                  className="w-10 border border-gray-300 rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
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

              <div className="w-full h-px bg-gray-200 my-0.5" />

              {/* Skip */}
              <button
                onClick={skipImage}
                disabled={!canNext}
                className={`px-1.5 py-1 rounded border transition-colors text-[10px] font-medium w-full text-center ${canNext ? 'bg-gray-50 border-gray-300 hover:bg-gray-200 text-gray-700' : 'text-gray-300 border-gray-200 cursor-not-allowed'}`}
                title="Skip without saving"
              >
                Skip
              </button>

              {/* Clear All */}
              <button
                onClick={() => {
                  if (window.confirm('Clear all labels on this text?')) {
                    setLabels([]);
                    if (setSelectedLabelIndices) setSelectedLabelIndices([]);
                  }
                }}
                className="px-1.5 py-1 bg-red-50 text-red-600 rounded border border-red-200 hover:bg-red-100 text-[10px] font-medium w-full text-center"
                title="Clear all labels"
              >
                Clear
              </button>

              {/* Mark Empty */}
              <button
                onClick={() => {
                  if (window.confirm('Mark as empty and go to next?')) markEmptyAndNext();
                }}
                className="px-1.5 py-1 bg-yellow-50 text-yellow-700 rounded border border-yellow-200 hover:bg-yellow-100 text-[10px] font-medium w-full text-center"
                title="Mark as empty"
              >
                Empty
              </button>

              {/* Delete */}
              <button
                onClick={deleteImage}
                className="px-1.5 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-medium w-full text-center"
                title="Delete from dataset"
              >
                Delete
              </button>
            </div>
          ) : (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white border border-gray-300 px-4 py-2 rounded shadow text-black z-10">
              <button
                onClick={() => {
                  if(window.confirm('Are you sure you want to delete all labels on this image?')) {
                    setLabels([]);
                    if (setSelectedLabelIndices) setSelectedLabelIndices([]);
                  }
                }}
                className="px-2 py-1 bg-red-50 text-red-600 rounded border border-red-200 hover:bg-red-100 text-xs font-medium"
                title="Clear all labels on this image"
              >
                Clear All
              </button>
              {(projectType === 'Yolo' || projectType === 'Yolo OBB' || projectType === 'KIE') && (
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
              <div className="w-px h-6 bg-gray-300 mx-1" />
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
              <div className="w-px h-6 bg-gray-300 mx-1" />
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
              <div className="w-px h-6 bg-gray-300 mx-1" />
              <button
                onClick={deleteImage}
                className="px-2 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 transition-colors text-xs font-medium"
                title="Delete Image from Dataset"
              >
                Delete
              </button>
            </div>
          )}
          </div>

          {projectType === 'Ocr' && (
            <div className="h-64 shrink-0 bg-white border-t border-gray-300 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-20">
              <OCRPanel 
                value={ocrValue} 
                onChange={setOcrValue} 
                onNext={canNext ? nextImage : undefined}
                onPrev={canPrev ? prevImage : undefined}
                prefixEnabled={prefixEnabled}
                setPrefixEnabled={setPrefixEnabled}
                prefixValue={prefixValue}
                setPrefixValue={setPrefixValue}
                ocrCharset={ocrCharset}
                hasModel={!!dbnetModelPath}
                isAiLoading={isAiLoading}
                onPredict={async (confThresh) => {
                  setAiThresh(confThresh);
                  await runLivePrediction(confThresh);
                }}
                autoPredictEnabled={autoPredictEnabled}
                setAutoPredictEnabled={setAutoPredictEnabled}
                ocrConf={ocrConf}
                setOcrConf={setOcrConf}
              />
            </div>
          )}
          
          {/* KIE project no longer has OCR text panel on screen */}
        </div>

        {/* Resizer Handle */}
        {projectType !== 'Ocr' && projectType !== 'VLM' && isRightSidebarOpen && (
          <div 
            onMouseDown={(e) => { e.preventDefault(); setIsResizingSidebar(true); }}
            className={`w-1 cursor-col-resize shrink-0 transition-colors border-l border-gray-300 ${isResizingSidebar ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-300'}`}
            style={{ zIndex: 50 }}
          />
        )}

        {/* Right panel wrapper (Classes / OCR Only) */}
        <div className={`relative flex flex-col h-full shrink-0 bg-white transition-all duration-200 ${(projectType === 'VLM' || (projectType === 'Ocr' && !ocrEnableClass)) ? 'hidden' : ''}`} style={{ width: isRightSidebarOpen ? sidebarWidth : 0 }}>
          <button
            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            className="absolute -left-4 top-1/2 -translate-y-1/2 w-4 h-16 bg-white border border-gray-300 rounded-l-md flex items-center justify-center hover:bg-gray-50 z-50 text-gray-500 shadow"
            style={{ left: '-16px' }}
            title="Toggle Right Sidebar"
          >
            {isRightSidebarOpen ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            )}
          </button>
          <div className={`flex flex-col h-full w-full overflow-y-auto ${!isRightSidebarOpen && 'hidden'}`}>
          {(projectType === 'Yolo' || projectType === 'Yolo OBB' || projectType === 'Classification' || projectType === 'KIE' || projectType === 'NER' || (projectType === 'Ocr' && ocrEnableClass)) && (
            <ClassPanel
              classes={classes}
              activeClassCode={activeClassCode}
              onSelectClass={(code) => {
                setActiveClassCode(code);
                // If a box is selected, change its class!
                if (selectedLabelIndices.length > 0) {
                  setLabels(prev => {
                    const newLabels = [...prev];
                    selectedLabelIndices.forEach(idx => {
                      newLabels[idx] = { ...newLabels[idx], class_code: code };
                    });
                    return newLabels;
                  });
                }
              }}
              projectType={projectType}
              selectedLabelIndices={selectedLabelIndices}
              labels={labels}
            />
          )}

          {projectType === 'Deskewer' && (
            <div className="p-4 flex flex-col h-full bg-white border-l border-gray-200">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-4">
                Deskewer Settings
              </label>

              <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-semibold text-gray-800">Rotation Angle</label>
                  <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-sm">{deskewAngle}°</span>
                </div>
                
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={deskewAngle}
                  onChange={(e) => setDeskewAngle(Number(e.target.value))}
                  className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer mb-4"
                />

                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setDeskewAngle(deskewAngle - rotationStep)} className="flex-1 bg-white border border-gray-300 rounded py-1.5 text-sm font-medium hover:bg-gray-100 transition shadow-sm">- {rotationStep}°</button>
                  <button onClick={() => setDeskewAngle(deskewAngle + rotationStep)} className="flex-1 bg-white border border-gray-300 rounded py-1.5 text-sm font-medium hover:bg-gray-100 transition shadow-sm">+ {rotationStep}°</button>
                </div>

                <div className="flex items-center justify-between mt-2 pt-4 border-t border-gray-200">
                  <label className="text-xs font-medium text-gray-600">Manual Input:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={deskewAngle}
                      onChange={(e) => setDeskewAngle(Number(e.target.value) || 0)}
                      className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                    />
                    <span className="text-xs text-gray-500">deg</span>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
                  Rotation Step (Arrow Keys)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rotationStep}
                    onChange={(e) => setRotationStep(Number(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                  />
                  <span className="text-sm text-gray-500 font-medium">deg</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-2 italic">Use Left / Right arrow keys to rotate quickly.</p>
              </div>

              <div className="mb-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <label className="text-sm font-semibold text-gray-800 block mb-2">Crop Area</label>
                <p className="text-xs text-gray-500 mb-3">
                  Click and drag on the image to draw a crop box. The crop will be applied after rotation.
                </p>
                {deskewCrop ? (
                  <div className="flex flex-col gap-2">
                     <span className="text-xs text-green-700 font-medium bg-green-100 px-2 py-1 rounded">
                       Crop active
                     </span>
                     <button
                       onClick={() => setDeskewCrop(null)}
                       className="w-full bg-white border border-red-300 text-red-600 rounded py-1.5 text-xs font-medium hover:bg-red-50 transition shadow-sm"
                     >
                       Clear Crop
                     </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 italic">No crop drawn</span>
                )}
              </div>

              <div className="mt-auto pt-4 border-t border-gray-200">
                <button
                  onClick={saveCurrent}
                  disabled={isSaving}
                  className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded shadow hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Label'}
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

