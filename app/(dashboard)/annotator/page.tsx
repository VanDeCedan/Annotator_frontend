'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import { useAppStore } from '@/lib/store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ---------------------------------------------------------------------------
// BoxOverlayCanvas – draws bounding boxes on a canvas overlaid on a thumbnail.
// ---------------------------------------------------------------------------
interface LabelEntry {
  class_code: number;
  coordinates: string;
}
interface ClassEntry {
  code: number;
  color: string;
}

function BoxOverlayCanvas({ 
  projectId, 
  imgName, 
  classes, 
  projectType 
}: { 
  projectId: string; 
  imgName: string;
  classes: ClassEntry[];
  projectType: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [labels, setLabels] = useState<LabelEntry[]>([]);

  // Fetch labels once on mount
  useEffect(() => {
    let active = true;
    api.get(`/projects/${projectId}/labels/${imgName}`)
      .then(res => {
        if (!active) return;
        const data = res.data;
        if (data.type === 'Yolo' || data.type === 'Yolo OBB' || data.type === 'KIE') {
          setLabels(data.labels || []);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [projectId, imgName]);

  // Draw boxes once labels are loaded
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || labels.length === 0) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    for (const lbl of labels) {
      const cls = classes.find((c) => c.code === lbl.class_code);
      const color = cls ? cls.color : '#ff0000';
      const coords = lbl.coordinates.split(' ').map(Number);
      if (coords.length < 4) continue;

      ctx.strokeStyle = color;
      ctx.fillStyle = color + '55'; // ~33% fill
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);

      if ((projectType === 'Yolo OBB') && coords.length === 8) {
        // 4 corner points, normalized: x1 y1 x2 y2 x3 y3 x4 y4
        ctx.beginPath();
        ctx.moveTo(coords[0] * W, coords[1] * H);
        ctx.lineTo(coords[2] * W, coords[3] * H);
        ctx.lineTo(coords[4] * W, coords[5] * H);
        ctx.lineTo(coords[6] * W, coords[7] * H);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Yolo / KIE: cx cy w h (normalized, center-based)
        const [cx, cy, bw, bh] = coords;
        const x = (cx - bw / 2) * W;
        const y = (cy - bh / 2) * H;
        ctx.beginPath();
        ctx.rect(x, y, bw * W, bh * H);
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [labels, classes, projectType]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// NERTextPreview – shows first lines of a text file as a card thumbnail
// ---------------------------------------------------------------------------
function NERTextPreview({ projectId, imgName }: { projectId: string; imgName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || fetchedRef.current) return;
        fetchedRef.current = true;
        try {
          const url = `${API_BASE}/projects/${projectId}/images/local_workspace/${encodeURIComponent(imgName)}`;
          const res = await fetch(url);
          const text = await res.text();
          setPreview(text.replace(/\r\n/g, '\n').slice(0, 300));
        } catch {
          setPreview('');
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [projectId, imgName]);

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-50 p-2 overflow-hidden text-left">
      {preview === null ? (
        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Loading…</div>
      ) : preview === '' ? (
        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Empty</div>
      ) : (
        <p className="text-[10px] text-gray-600 leading-relaxed whitespace-pre-wrap break-words line-clamp-[8]">{preview}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImageGridPanel – scrollable thumbnail grid shown when a mode card is clicked
// ---------------------------------------------------------------------------
interface ImageGridPanelProps {
  mode: 'annotated' | 'unannotated' | 'skipped';
  images: string[];
  projectId: string;
  projectType: string;
  onClose: () => void;
}

function ImageGridPanel({ mode, images, projectId, projectType, onClose }: ImageGridPanelProps) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState(50);

  // Fetch classes once if in annotated mode
  useEffect(() => {
    if (mode === 'annotated') {
      api.get(`/projects/${projectId}/classes`)
        .then(res => setClasses(res.data || []))
        .catch(() => {});
    }
  }, [projectId, mode]);

  // Reset pagination on search
  useEffect(() => {
    setVisibleCount(50);
  }, [search]);

  const filtered = search.trim()
    ? images.filter((img) => img.toLowerCase().includes(search.trim().toLowerCase()))
    : images;

  const visibleImages = filtered.slice(0, visibleCount);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Load more if user is near the bottom
    if (scrollHeight - scrollTop - clientHeight < 400) {
      if (visibleCount < filtered.length) {
        setVisibleCount(prev => prev + 50);
      }
    }
  };

  const colorMap = {
    unannotated: { border: 'border-blue-400', btn: 'bg-blue-600 hover:bg-blue-700', label: 'Unannotated' },
    annotated:   { border: 'border-green-400', btn: 'bg-green-600 hover:bg-green-700', label: 'Annotated' },
    skipped:     { border: 'border-gray-400',  btn: 'bg-gray-600 hover:bg-gray-700',  label: 'Skipped' },
  };
  const c = colorMap[mode];

  const jumpTo = (imgName: string) => {
    router.push(`/annotate/${projectId}/0?mode=${mode}&startImage=${encodeURIComponent(imgName)}`);
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div className={`bg-white rounded-xl shadow-2xl border-2 ${c.border} w-full max-w-5xl flex flex-col`} style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-black">{c.label} Images</h3>
            <p className="text-sm text-gray-500">{images.length} image{images.length !== 1 ? 's' : ''} — scroll &amp; pick a thumbnail to jump there</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => images.length > 0 && jumpTo(images[0])}
              className={`${c.btn} text-white text-sm font-semibold px-4 py-2 rounded-lg transition`}
            >
              ▶ Start from Beginning
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-black transition text-2xl leading-none"
              title="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b flex-shrink-0">
          <input
            type="text"
            placeholder="Search by filename…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 p-6" onScroll={handleScroll}>
          {filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-16">No images match your search.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {visibleImages.map((imgName) => {
                const originalIdx = images.indexOf(imgName);
                const thumbUrl = `${API_BASE}/projects/${projectId}/images/local_workspace/${encodeURIComponent(imgName)}`;
                return (
                  <div
                    key={imgName}
                    className="group relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col"
                    onClick={() => jumpTo(imgName)}
                    title={imgName}
                  >
                    <div className="relative w-full aspect-square bg-gray-100 overflow-hidden">
                      {projectType === 'NER' ? (
                        <NERTextPreview projectId={projectId} imgName={imgName} />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={thumbUrl}
                          alt={imgName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      {/* Box overlay for annotated images (non-NER) */}
                      {mode === 'annotated' && projectType !== 'NER' && (
                        <BoxOverlayCanvas
                          projectId={projectId}
                          imgName={imgName}
                          classes={classes}
                          projectType={projectType}
                        />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className={`${c.btn} text-white text-xs font-bold px-3 py-1.5 rounded-full shadow`}>
                          ▶ Start
                        </span>
                      </div>
                      <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                        #{originalIdx + 1}
                      </span>
                    </div>
                    <div className="px-2 py-1.5 text-[11px] text-gray-600 truncate" title={imgName}>
                      {imgName}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnnotatorSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project');

  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  
  const [projectInfo, setProjectInfo] = useState<any>(null);
  const [stats, setStats] = useState({ labeled: 0, bg_count: 0 });
  const [annotatedImages, setAnnotatedImages] = useState<string[]>([]);
  const [unannotatedImages, setUnannotatedImages] = useState<string[]>([]);
  const [skippedImages, setSkippedImages] = useState<string[]>([]);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);

  const { user, showToast } = useAppStore();

  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPrelabels, setIsUploadingPrelabels] = useState(false);
  const [boxImagesCount, setBoxImagesCount] = useState<number>(0);
  const [isUploadingBoxImages, setIsUploadingBoxImages] = useState(false);

  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [prelabelsProgress, setPrelabelsProgress] = useState<{ current: number; total: number } | null>(null);
  const [boxImagesProgress, setBoxImagesProgress] = useState<{ current: number; total: number } | null>(null);

  // Which mode's image grid panel is open (null = closed)
  const [gridPanel, setGridPanel] = useState<'annotated' | 'unannotated' | 'skipped' | null>(null);

  const loadBoxImagesData = useCallback(async (id: string) => {
    try {
      const res = await api.get(`/projects/${id}/box-images`);
      setBoxImagesCount((res.data.image_names || []).length);
    } catch {
      setBoxImagesCount(0);
    }
  }, []);

  const loadWorkspaceData = useCallback(async (id: string) => {
    setIsWorkspaceLoading(true);
    try {
      // Fetch all images in the local workspace
      const imagesRes = await api.get(`/projects/${id}/images/local_workspace`);
      const allImages: string[] = imagesRes.data.image_names || [];

      // Fetch progress
      const progressRes = await api.get(`/projects/${id}/labels/progress/`);
      const labeledImages: string[] = progressRes.data.labeled_images || [];
      const skipped_images: string[] = progressRes.data.skipped_images || [];
      
      setStats({ 
        labeled: progressRes.data.labeled_count, 
        bg_count: progressRes.data.bg_count || 0 
      });

      const allImagesSet = new Set(allImages);
      const labeledSet = new Set(labeledImages);
      const skippedSet = new Set(skipped_images);

      // Preserve backend order (most recently annotated first)
      const annotated = labeledImages.filter(img => allImagesSet.has(img));
      const skipped = skipped_images.filter(img => allImagesSet.has(img));
      const unannotated = allImages.filter(img => !labeledSet.has(img) && !skippedSet.has(img));
      
      setAnnotatedImages(annotated);
      setUnannotatedImages(unannotated);
      setSkippedImages(skipped);
    } catch (err) {
      console.error('Failed to load workspace data', err);
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, []);
  
  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
      loadProject(projectId);
      loadWorkspaceData(projectId);
      loadBoxImagesData(projectId);
    }
    loadAllProjects();
  }, [projectId, loadWorkspaceData, loadBoxImagesData]);

  const loadAllProjects = async () => {
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch {}
  };

  const loadProject = async (id: string) => {
    try {
      const res = await api.get('/projects');
      const proj = res.data.find((p: any) => p.id === Number(id));
      if (proj) setProjectInfo(proj);
    } catch {}
  };

  const handleProjectSelect = (id: string) => {
    setSelectedProjectId(id);
    if (id) {
      router.push(`/annotator?project=${id}`);
    } else {
      router.push('/annotator');
    }
  };

  const handleStartAnnotation = (mode: 'annotated' | 'unannotated' | 'skipped') => {
    setGridPanel(mode);
  };

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const filesArray = Array.from(e.target.files);
    setIsUploading(true);
    setUploadProgress({ current: 0, total: filesArray.length });
    
    const chunkSize = 200;

    try {
      for (let i = 0; i < filesArray.length; i += chunkSize) {
        const chunk = filesArray.slice(i, i + chunkSize);
        const formData = new FormData();
        chunk.forEach((file) => formData.append('files', file));

        await api.post(`/projects/${projectId}/images/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const currentCount = Math.min(i + chunk.length, filesArray.length);
        setUploadProgress({ current: currentCount, total: filesArray.length });
      }
      showToast(`Successfully added ${filesArray.length} ${projectInfo?.type === 'NER' ? 'texts' : 'images'} to project workspace`, 'success');
      loadWorkspaceData(projectId!);
    } catch (err: any) {
      showToast(`Failed to upload some ${projectInfo?.type === 'NER' ? 'texts' : 'images'}`, 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleUploadPrelabels = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const filesArray = Array.from(e.target.files);
    setIsUploadingPrelabels(true);
    setPrelabelsProgress({ current: 0, total: filesArray.length });
    const chunkSize = 200;

    try {
      for (let i = 0; i < filesArray.length; i += chunkSize) {
        const chunk = filesArray.slice(i, i + chunkSize);
        const formData = new FormData();
        chunk.forEach((file) => formData.append('files', file));

        await api.post(`/projects/${projectId}/prelabels`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const currentCount = Math.min(i + chunk.length, filesArray.length);
        setPrelabelsProgress({ current: currentCount, total: filesArray.length });
      }
      showToast(`Successfully uploaded ${filesArray.length} prelabels`, 'success');
    } catch (err: any) {
      console.error("Upload Prelabels Error:", err.response?.data);
      if (err.response?.data?.detail?.invalid_files) {
        const invalidFiles = err.response.data.detail.invalid_files;
        const msg = `Validation failed: ${invalidFiles.slice(0, 3).join(', ')}${invalidFiles.length > 3 ? '...' : ''}`;
        showToast(msg, 'error');
      } else if (err.response?.data?.detail && typeof err.response.data.detail === 'string') {
        showToast(err.response.data.detail, 'error');
      } else if (err.response?.data?.detail?.[0]?.msg) {
        showToast(err.response.data.detail[0].msg, 'error');
      } else {
        showToast('Failed to upload prelabels', 'error');
      }
    } finally {
      setIsUploadingPrelabels(false);
      setPrelabelsProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleDeletePrelabels = async () => {
    if (!confirm('Are you sure you want to delete all prelabels for this project?')) return;
    try {
      await api.delete(`/projects/${projectId}/prelabels`);
      showToast('Prelabels deleted', 'success');
    } catch {
      showToast('Failed to delete prelabels', 'error');
    }
  };

  const handleUploadBoxImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const filesArray = Array.from(e.target.files);
    setIsUploadingBoxImages(true);
    setBoxImagesProgress({ current: 0, total: filesArray.length });

    const chunkSize = 200;

    try {
      for (let i = 0; i < filesArray.length; i += chunkSize) {
        const chunk = filesArray.slice(i, i + chunkSize);
        const formData = new FormData();
        chunk.forEach((file) => formData.append('files', file));

        await api.post(`/projects/${projectId}/box-images/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const currentCount = Math.min(i + chunk.length, filesArray.length);
        setBoxImagesProgress({ current: currentCount, total: filesArray.length });
      }
      showToast(`Successfully uploaded ${filesArray.length} box images`, 'success');
      loadBoxImagesData(projectId!);
    } catch {
      showToast('Failed to upload box images', 'error');
    } finally {
      setIsUploadingBoxImages(false);
      setBoxImagesProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleClearBoxImages = async () => {
    if (!confirm('Are you sure you want to clear all uploaded box images for this project?')) return;
    try {
      await api.delete(`/projects/${projectId}/box-images`);
      showToast('Box images cleared', 'success');
      loadBoxImagesData(projectId!);
    } catch {
      showToast('Failed to clear box images', 'error');
    }
  };

  const handleClearWorkspace = async () => {
    const fileType = projectInfo?.type === 'NER' ? 'texts' : 'images';
    if (!confirm(`Are you sure you want to clear all ${fileType} from this project workspace? Labels will NOT be deleted.`)) return;
    try {
      await api.delete(`/projects/${projectId}/images/local_workspace`);
      showToast(`Workspace ${fileType} cleared`, 'success');
      loadWorkspaceData(projectId!);
    } catch {
      showToast('Failed to clear workspace', 'error');
    }
  };

  if (!projectInfo) {
    return (
      <div className="text-black max-w-3xl mx-auto py-10">
        <div className="bg-white border rounded shadow-md p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Select a Project</h2>
          <p className="text-gray-500 mb-6">Choose a project to manage its local workspace</p>
          <div className="max-w-md mx-auto text-left">
            <label className="block text-sm font-medium text-black mb-1">Project</label>
            <select
              className="w-full border border-gray-300 px-3 py-2 rounded text-black bg-white focus:outline-none focus:ring focus:border-blue-300"
              value={selectedProjectId}
              onChange={(e) => handleProjectSelect(e.target.value)}
            >
              <option value="">-- Choose Project --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-black max-w-4xl mx-auto pb-10">
      {/* Image Grid Panel overlay */}
      {gridPanel && projectId && (
        <ImageGridPanel
          mode={gridPanel}
          images={
            gridPanel === 'annotated' ? annotatedImages :
            gridPanel === 'skipped'   ? skippedImages :
            unannotatedImages
          }
          projectId={projectId}
          projectType={projectInfo?.type || ''}
          onClose={() => setGridPanel(null)}
        />
      )}

      {/* Back */}
      <button onClick={() => router.push(`/annotator`)} className="text-sm text-gray-500 hover:text-black mb-4 inline-flex items-center gap-1">
        ← Back to Projects
      </button>

      {/* Project header card */}
      <div className="bg-white border rounded shadow-md overflow-hidden mb-6">
        <div className="bg-gray-100 border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-black">{projectInfo.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{projectInfo.type}</span>
              <span className="text-sm text-gray-600">
                Total Labeled: <strong className="text-black">{stats.labeled}</strong>
              </span>
              {(projectInfo.type === 'Yolo' || projectInfo.type === 'Yolo OBB') && stats.bg_count > 0 && (
                <span className="text-sm text-gray-600 border-l border-gray-300 pl-3">
                  Background: <strong className="text-green-600">{stats.bg_count}</strong>
                </span>
              )}
            </div>
          </div>
          {user?.role === 'admin' && (
            <Button
              variant="secondary"
              onClick={() => router.push(`/dataset?project=${projectId}`)}
            >
              📦 Export Dataset
            </Button>
          )}
        </div>
      </div>

      {/* Workspace Dashboard */}
      <div className="bg-white border rounded shadow-md p-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold">Local Workspace</h3>
            <p className="text-sm text-gray-500">Pick up where you left off or correct previous annotations.</p>
          </div>
          <Button variant="danger" onClick={handleClearWorkspace} disabled={annotatedImages.length === 0 && unannotatedImages.length === 0 && skippedImages.length === 0}>
            Clear Workspace
          </Button>
        </div>

        {isWorkspaceLoading ? (
          <div className="flex justify-center items-center h-32">
            <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div 
              onClick={() => unannotatedImages.length > 0 && handleStartAnnotation('unannotated')}
              className={`border rounded-xl p-6 flex flex-col items-center text-center transition-all ${
                unannotatedImages.length > 0 
                  ? 'cursor-pointer hover:shadow-md hover:border-blue-300 hover:-translate-y-1 bg-white' 
                  : 'bg-gray-50 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-3">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h4 className="text-lg font-bold mb-1">Unannotated</h4>
              <p className="text-gray-500 text-sm mb-3">Continue labeling new {projectInfo?.type === 'NER' ? 'texts' : 'images'}</p>
              <span className="inline-block bg-blue-100 text-blue-800 text-xl font-bold px-4 py-1 rounded-full">
                {unannotatedImages.length}
              </span>
            </div>

            <div 
              onClick={() => annotatedImages.length > 0 && handleStartAnnotation('annotated')}
              className={`border rounded-xl p-6 flex flex-col items-center text-center transition-all ${
                annotatedImages.length > 0 
                  ? 'cursor-pointer hover:shadow-md hover:border-green-300 hover:-translate-y-1 bg-white' 
                  : 'bg-gray-50 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="w-14 h-14 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-3">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-lg font-bold mb-1">Annotated</h4>
              <p className="text-gray-500 text-sm mb-3">Review or correct existing labels</p>
              <span className="inline-block bg-green-100 text-green-800 text-xl font-bold px-4 py-1 rounded-full">
                {annotatedImages.length}
              </span>
              {(projectInfo?.type === 'Yolo' || projectInfo?.type === 'Yolo OBB') && stats.bg_count > 0 && (
                <div className="mt-3 text-xs font-semibold text-green-800 bg-green-200 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {stats.bg_count} Background Images
                </div>
              )}
            </div>

            <div 
              onClick={() => skippedImages.length > 0 && handleStartAnnotation('skipped')}
              className={`border rounded-xl p-6 flex flex-col items-center text-center transition-all ${
                skippedImages.length > 0 
                  ? 'cursor-pointer hover:shadow-md hover:border-gray-400 hover:-translate-y-1 bg-white' 
                  : 'bg-gray-50 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="w-14 h-14 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center mb-3">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="text-lg font-bold mb-1">Skipped</h4>
              <p className="text-gray-500 text-sm mb-3">Review intentionally skipped {projectInfo?.type === 'NER' ? 'texts' : 'images'}</p>
              <span className="inline-block bg-gray-200 text-gray-700 text-xl font-bold px-4 py-1 rounded-full">
                {skippedImages.length}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Add More Images */}
        <div className="bg-white border rounded shadow-md p-6">
          <h3 className="text-base font-bold mb-1">{projectInfo?.type === 'NER' ? 'Add Texts to Workspace' : 'Add Images to Workspace'}</h3>
          <p className="text-sm text-gray-500 mb-4">
            Upload {projectInfo?.type === 'NER' ? 'text files' : 'images'} to expand your local workspace. They will be sorted automatically.
          </p>

          <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded cursor-pointer bg-gray-50 hover:bg-gray-100 transition ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <svg className="w-8 h-8 mb-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-600">
                <span className="font-bold text-black">Click to add {projectInfo?.type === 'NER' ? 'text files' : 'images'}</span>
              </p>
            </div>
            <input type="file" multiple accept={projectInfo?.type === 'NER' ? '.txt' : 'image/*'} className="hidden" onChange={handleUploadImages} disabled={isUploading} />
          </label>
          {isUploading && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
              <div className="flex justify-between text-xs font-semibold text-blue-800 mb-1">
                <span>Uploading workspace {projectInfo?.type === 'NER' ? 'texts' : 'images'}...</span>
                <span>
                  {uploadProgress ? `${uploadProgress.current.toLocaleString()} / ${uploadProgress.total.toLocaleString()}` : 'Processing...'}
                </span>
              </div>
              {uploadProgress && (
                <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-200"
                    style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Box Images */}
        {(projectInfo.type === 'Yolo' || projectInfo.type === 'Yolo OBB') && (
          <div className="bg-white border rounded shadow-md p-6">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-base font-bold">Boxes Images</h3>
                <p className="text-sm text-gray-500">Upload cut-out images to place onto canvas during annotation.</p>
              </div>
              <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-1 rounded-full">
                {boxImagesCount} Loaded
              </span>
            </div>
            <div className="flex flex-col gap-3 mt-4">
              <label className="relative block">
                <Button disabled={isUploadingBoxImages} className="w-full bg-purple-600 hover:bg-purple-700 text-white" asChild>
                  <span>{isUploadingBoxImages ? 'Uploading...' : 'Upload Box Images (PNG/JPG)'}</span>
                </Button>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleUploadBoxImages} disabled={isUploadingBoxImages} />
              </label>
              {isUploadingBoxImages && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
                  <div className="flex justify-between text-xs font-semibold text-purple-800 mb-1">
                    <span>Uploading box images...</span>
                    <span>
                      {boxImagesProgress ? `${boxImagesProgress.current.toLocaleString()} / ${boxImagesProgress.total.toLocaleString()}` : 'Processing...'}
                    </span>
                  </div>
                  {boxImagesProgress && (
                    <div className="w-full bg-purple-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-purple-600 h-2 rounded-full transition-all duration-200"
                        style={{ width: `${Math.round((boxImagesProgress.current / boxImagesProgress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
              {boxImagesCount > 0 && (
                <Button variant="danger" className="w-full" onClick={handleClearBoxImages}>Clear All Box Images</Button>
              )}
            </div>
          </div>
        )}

        {/* Prelabels */}
        {user?.role === 'admin' && (
          <div className="bg-white border rounded shadow-md p-6">
            <h3 className="text-base font-bold mb-1">Prelabels</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload .txt files to pre-populate annotations.
            </p>
            <div className="flex flex-col gap-3">
              <label className="relative block">
                <Button disabled={isUploadingPrelabels} className="w-full" asChild>
                  <span>{isUploadingPrelabels ? 'Uploading...' : (projectInfo?.type === 'KIE' ? 'Upload Prelabels (.json)' : 'Upload Prelabels (.txt)')}</span>
                </Button>
                <input type="file" multiple accept={projectInfo?.type === 'KIE' ? '.json' : '.txt'} className="hidden" onChange={handleUploadPrelabels} disabled={isUploadingPrelabels} />
              </label>
              {isUploadingPrelabels && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
                  <div className="flex justify-between text-xs font-semibold text-green-800 mb-1">
                    <span>Uploading prelabels...</span>
                    <span>
                      {prelabelsProgress ? `${prelabelsProgress.current.toLocaleString()} / ${prelabelsProgress.total.toLocaleString()}` : 'Processing...'}
                    </span>
                  </div>
                  {prelabelsProgress && (
                    <div className="w-full bg-green-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-200"
                        style={{ width: `${Math.round((prelabelsProgress.current / prelabelsProgress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
              <Button variant="danger" className="w-full" onClick={handleDeletePrelabels}>Clear All Prelabels</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


