'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import { useAppStore } from '@/lib/store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AugOptions {
  flip_h: boolean;
  flip_v: boolean;
  flip_hv: boolean;
  grain: boolean;
  noise: boolean;
  blur: boolean;
  num_augs: number;
  deskew_angles: number[];
  ocr_distortion_intensity: number;
  ocr_noise_intensity: number;
  ocr_blur_intensity: number;
}

interface ExportConfig {
  export_mode: 'full' | 'crop';
  yolo_version: string;
  resize: string;
  grayscale: boolean;
  split_enabled: boolean;
  train_pct: number;
  val_pct: number;
  test_pct: number;
  aug_enabled: boolean;
  augmentation: AugOptions;
}

// ─── Helper Components ────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded shadow-md p-6 mb-4">
      <h3 className="text-base font-bold text-black mb-4 pb-2 border-b border-gray-200">{title}</h3>
      {children}
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-300"
      />
      <div>
        <span className="text-sm font-medium text-black group-hover:text-blue-600 transition-colors">{label}</span>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-blue-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DatasetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project');
  const { user, showToast } = useAppStore();

  const [projectInfo, setProjectInfo] = useState<any>(null);
  const [labeledImages, setLabeledImages] = useState<string[]>([]);
  const [labeledCount, setLabeledCount] = useState(0);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressData, setProgressData] = useState<{current: number, total: number, startTime: number} | null>(null);

  const [totalSelected, setTotalSelected] = useState(0);

  const [config, setConfig] = useState<ExportConfig>({
    export_mode: 'full',
    yolo_version: 'v8',
    resize: '',
    grayscale: false,
    split_enabled: true,
    train_pct: 70,
    val_pct: 20,
    test_pct: 10,
    aug_enabled: false,
    augmentation: {
      flip_h: false,
      flip_v: false,
      flip_hv: false,
      grain: false,
      noise: false,
      blur: false,
      num_augs: 3,
      deskew_angles: [],
      ocr_distortion_intensity: 0,
      ocr_noise_intensity: 0,
      ocr_blur_intensity: 0,
    },
  });


  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
      loadData(projectId);
    }
    loadAllProjects();
  }, [projectId]);

  const loadAllProjects = async () => {
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch {}
  };

  const loadData = async (id: string) => {
    setIsLoadingStats(true);
    try {
      const [pRes, sRes] = await Promise.all([
        api.get('/projects'),
        api.get(`/projects/${id}/labels/progress/`),
      ]);
      const proj = pRes.data.find((p: any) => p.id === Number(id));
      if (proj) setProjectInfo(proj);
      setLabeledImages(sRes.data.labeled_images || []);
      setLabeledCount(sRes.data.labeled_count || 0);
    } catch {
      showToast('Failed to load project data', 'error');
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleProjectSelect = (id: string) => {
    setSelectedProjectId(id);
    if (id) {
      router.push(`/dataset?project=${id}`);
    } else {
      router.push('/dataset');
    }
  };

  // ── Split validation ──────────────────────────────────────────────────────

  const splitTotal = config.train_pct + config.val_pct + config.test_pct;
  const splitValid = Math.abs(splitTotal - 100) < 0.5;

  // ── Generate & Download ───────────────────────────────────────────────────

  const [generatedFile, setGeneratedFile] = useState<{url: string, filename: string, blob: Blob} | null>(null);

  const handleGenerate = async () => {
    if (labeledCount === 0) {
      showToast('No labeled images found for this project', 'error');
      return;
    }
    if (config.split_enabled && !splitValid) {
      showToast('Train/Val/Test percentages must sum to 100%', 'error');
      return;
    }

    setIsGenerating(true);
    setGeneratedFile(null);
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    setProgressData({ current: 0, total: labeledCount, startTime: Date.now() });

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/projects/${projectId}/dataset/progress/${taskId}`);
        if (res.data) {
          setProgressData(prev => ({
            ...prev!,
            current: res.data.current,
            total: res.data.total,
            startTime: res.data.start_time * 1000,
          }));
        }
      } catch (e) {}
    }, 1000);

    try {
      showToast('Generating dataset (this may take a while)...', 'success');

      const payload: any = {
        session_id: 'local_workspace',
        task_id: taskId,
        export_mode: isYolo ? config.export_mode : 'full',
        resize: config.resize.trim() || null,
        grayscale: config.grayscale || false,
        split_enabled: config.split_enabled,
        train_pct: config.train_pct,
        val_pct: config.val_pct,
        test_pct: config.test_pct,
        yolo_version: config.yolo_version,
        augmentation: config.aug_enabled ? config.augmentation : null,
      };


      const res = await api.post(`/projects/${projectId}/dataset/generate`, payload, {
        responseType: 'blob',
      });

      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const filename = `dataset_${projectInfo?.name?.replace(/\s+/g, '_') || projectId}_${Date.now()}.zip`;
      
      setGeneratedFile({ url, filename, blob });
      showToast('Dataset generated! Click Download to save it.', 'success');
    } catch (err: any) {
      let errorMsg = 'Failed to generate dataset';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.detail) {
            errorMsg = typeof json.detail === 'string' ? json.detail : JSON.stringify(json.detail);
          }
        } catch (e) {
          // Keep default errorMsg
        }
      } else if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        errorMsg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      } else if (err.message) {
        errorMsg = err.message;
      }
      showToast(typeof errorMsg === 'string' ? errorMsg : 'Failed to generate dataset', 'error');
    } finally {
      clearInterval(interval);
      setIsGenerating(false);
      setProgressData(null);
    }
  };

  const handleDownloadClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if ('showSaveFilePicker' in window && generatedFile) {
      e.preventDefault();
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: generatedFile.filename,
          types: [{
            description: 'ZIP Archive',
            accept: {'application/zip': ['.zip']},
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(generatedFile.blob);
        await writable.close();
        showToast('Dataset saved successfully!', 'success');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
           console.error(err);
           // Fallback if File System API fails for some reason
           const link = document.createElement('a');
           link.href = generatedFile.url;
           link.download = generatedFile.filename;
           link.click();
        }
      }
    }
  };

  // ── Config helpers ────────────────────────────────────────────────────────

  const setAug = (key: keyof AugOptions, value: any) =>
    setConfig((c) => ({ ...c, augmentation: { ...c.augmentation, [key]: value } }));

  const isYolo = projectInfo?.type === 'Yolo' || projectInfo?.type === 'Yolo OBB';
  const isOCR = projectInfo?.type === 'Ocr';

  if (!projectInfo) {
    return (
      <div className="text-black max-w-3xl mx-auto py-10">
        <div className="bg-white border rounded shadow-md p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Select a Project</h2>
          <p className="text-gray-500 mb-6">Choose a project to generate and export its dataset</p>
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

  // Render
  return (
    <div className="text-black max-w-3xl">
      {/* Back */}
      <button
        onClick={() => router.push(`/dataset`)}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium mb-4 inline-flex items-center gap-1"
      >
        ← Back to Projects
      </button>

      {/* Page title */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Export Dataset</h2>
          <p className="text-sm text-gray-500">
            Project: <span className="font-semibold text-black">{projectInfo.name}</span>
            <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{projectInfo.type}</span>
          </p>
        </div>
      </div>

      {/* ── Section 1: Report ─────────────────────────────────────────────── */}
      <SectionCard title="📊 Labeled Images Report">
        {isLoadingStats ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading...
          </div>
        ) : (
          <>
            <div className="flex items-center gap-6 mb-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{labeledCount}</div>
                <div className="text-xs text-gray-500 mt-1">Labeled images</div>
              </div>
              {labeledCount === 0 && (
                <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded px-4 py-3 text-sm text-yellow-800">
                  ⚠ No labeled images found. Please annotate some images before generating a dataset.
                </div>
              )}
            </div>
            {labeledImages.length > 0 && (
              <div className="max-h-40 overflow-y-auto border rounded bg-gray-50 p-3">
                <p className="text-xs text-gray-500 mb-2 font-medium">Image names:</p>
                <div className="flex flex-wrap gap-1">
                  {labeledImages.map((img, i) => (
                    <span key={i} className="text-xs bg-white border rounded px-2 py-0.5 text-gray-700">
                      {img}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* Removed redundant image upload section because images are persistent */}

      <div className={`transition-opacity duration-300 opacity-100`}>
      {/* ── Section 2: Format Settings ────────────────────────────────────── */}
      <SectionCard title="⚙️ Format Settings">
        {/* Export Specification — only for YOLO & YOLO OBB projects */}
        {isYolo && (
          <div className="mb-6 border-b border-gray-200 pb-4">
            <label className="block text-sm font-bold text-black mb-2">Export Output Specification</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, export_mode: 'full' }))}
                className={`p-4 rounded border text-left transition flex flex-col justify-between ${
                  config.export_mode === 'full'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium ring-1 ring-blue-600'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold">🖼️ Full Images & Labels</span>
                  {config.export_mode === 'full' && <span className="text-blue-600 text-xs font-semibold">✓ Selected</span>}
                </div>
                <span className="text-xs text-gray-500">
                  Exports full images with YOLO bounding box text label files (.txt) & data.yaml
                </span>
              </button>

              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, export_mode: 'crop' }))}
                className={`p-4 rounded border text-left transition flex flex-col justify-between ${
                  config.export_mode === 'crop'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium ring-1 ring-blue-600'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold">✂️ Sliced Box Crops</span>
                  {config.export_mode === 'crop' && <span className="text-blue-600 text-xs font-semibold">✓ Selected</span>}
                </div>
                <span className="text-xs text-gray-500">
                  Uses bounding boxes as a slicer to output cropped sub-images per class folder
                </span>
              </button>
            </div>
          </div>
        )}

        {/* YOLO version — only for YOLO projects in full export mode */}
        {isYolo && config.export_mode === 'full' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-black mb-1">YOLO Format Version</label>
            <select
              value={config.yolo_version}
              onChange={(e) => setConfig((c) => ({ ...c, yolo_version: e.target.value }))}
              className="w-full max-w-xs border px-3 py-2 rounded text-black bg-white focus:outline-none focus:ring focus:border-blue-300"
            >
              <option value="v5">YOLO v5 PyTorch</option>
              <option value="v8">YOLO v8 / v11 PyTorch</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Determines the <code>data.yaml</code> format included in the ZIP.
            </p>
          </div>
        )}

        {/* Resize */}
        <div className="mb-2">
          <label className="block text-sm font-medium text-black mb-1">
            Resize Images <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <div className="flex items-center gap-3">
            <select
              value={config.resize}
              onChange={(e) => setConfig((c) => ({ ...c, resize: e.target.value }))}
              className="border px-3 py-2 rounded text-black bg-white focus:outline-none focus:ring focus:border-blue-300 w-48"
            >
              <option value="">No Resize (Original)</option>
              <option value="192x192">192 x 192</option>
              <option value="224x224">224 x 224</option>
              <option value="256x256">256 x 256</option>
              <option value="320x320">320 x 320</option>
              <option value="416x416">416 x 416</option>
              <option value="512x512">512 x 512</option>
              <option value="624x624">624 x 624</option>
              <option value="640x640">640 x 640</option>
              <option value="800x800">800 x 800</option>
              <option value="1024x1024">1024 x 1024</option>
            </select>
          </div>
          <p className="text-xs text-gray-500 mt-1">Select dimensions to scale images. Leave as &quot;No Resize&quot; to keep original size.</p>
        </div>
        <div className="mb-2 mt-4">
          <div className="flex items-center gap-3">
            <ToggleSwitch
              checked={config.grayscale || false}
              onChange={(v) => setConfig((c) => ({ ...c, grayscale: v }))}
            />
            <div>
              <span className="text-sm font-semibold text-black">Convertir en noir et blanc (Grayscale)</span>
              <p className="text-xs text-gray-500">Convertit toutes les images exportées en noir et blanc</p>
            </div>
          </div>
        </div>
      </SectionCard>


      {/* ── Section 3: Train / Val / Test Split ───────────────────────────── */}
      <SectionCard title="📂 Train / Val / Test Split">
        <div className="flex items-center gap-3 mb-4">
          <ToggleSwitch checked={config.split_enabled} onChange={(v) => setConfig((c) => ({ ...c, split_enabled: v }))} />
          <span className="text-sm font-medium">{config.split_enabled ? 'Split enabled' : 'No split — all images in one folder'}</span>
        </div>

        {config.split_enabled && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">Train %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.train_pct}
                  onChange={(e) => setConfig((c) => ({ ...c, train_pct: Number(e.target.value) }))}
                  className="w-full border px-3 py-2 rounded text-black bg-white focus:outline-none focus:ring focus:border-blue-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Validation %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.val_pct}
                  onChange={(e) => setConfig((c) => ({ ...c, val_pct: Number(e.target.value) }))}
                  className="w-full border px-3 py-2 rounded text-black bg-white focus:outline-none focus:ring focus:border-blue-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Test %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.test_pct}
                  onChange={(e) => setConfig((c) => ({ ...c, test_pct: Number(e.target.value) }))}
                  className="w-full border px-3 py-2 rounded text-black bg-white focus:outline-none focus:ring focus:border-blue-300"
                />
              </div>
            </div>
            <div className={`mt-3 text-sm font-medium ${splitValid ? 'text-green-600' : 'text-red-600'}`}>
              Total: {splitTotal}% {splitValid ? '✓' : '— must equal 100%'}
            </div>

            {/* Visual split preview */}
            {splitValid && (
              <div className="mt-3 flex rounded overflow-hidden h-4 text-xs font-medium">
                <div className="bg-blue-500 flex items-center justify-center text-white" style={{ width: `${config.train_pct}%` }}>
                  {config.train_pct > 10 ? `Train ${config.train_pct}%` : ''}
                </div>
                <div className="bg-green-500 flex items-center justify-center text-white" style={{ width: `${config.val_pct}%` }}>
                  {config.val_pct > 10 ? `Val ${config.val_pct}%` : ''}
                </div>
                <div className="bg-orange-400 flex items-center justify-center text-white" style={{ width: `${config.test_pct}%` }}>
                  {config.test_pct > 10 ? `Test ${config.test_pct}%` : ''}
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* ── Section 4: Augmentation ───────────────────────────────────────── */}
      <SectionCard title="🔁 Data Augmentation">
        <div className="flex items-center gap-3 mb-4">
          <ToggleSwitch
            checked={config.aug_enabled}
            onChange={(v) => setConfig((c) => ({ ...c, aug_enabled: v }))}
          />
          <span className="text-sm font-medium">
            {config.aug_enabled ? 'Augmentation enabled' : 'No augmentation'}
          </span>
        </div>

        {config.aug_enabled && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-black mb-1">
                Augmented copies per original image
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={config.augmentation.num_augs}
                onChange={(e) => setAug('num_augs', Number(e.target.value))}
                className="border px-3 py-2 rounded text-black bg-white focus:outline-none focus:ring focus:border-blue-300 w-24"
              />
              <p className="text-xs text-gray-500 mt-1">Each original image will produce this many additional augmented variants.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {projectInfo?.type === 'Deskewer' ? (
                <>
                  <p className="col-span-2 text-sm text-gray-700 font-semibold mb-2">Select predefined angles for data augmentation:</p>
                  {Array.from({ length: 23 }, (_, i) => (i + 1) * 15).map(angle => (
                    <CheckboxRow
                      key={angle}
                      label={`${angle}° Rotation`}
                      checked={config.augmentation.deskew_angles.includes(angle)}
                      onChange={(checked) => {
                        const newAngles = checked
                          ? [...config.augmentation.deskew_angles, angle]
                          : config.augmentation.deskew_angles.filter(a => a !== angle);
                        setAug('deskew_angles', newAngles);
                        setAug('num_augs', newAngles.length);
                      }}
                    />
                  ))}
                </>
              ) : projectInfo?.type === 'Ocr' ? (
                <div className="flex flex-col gap-4 py-2">
                  <div className="flex justify-between items-center bg-gray-50 p-3 rounded">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-black">Distorsion forte (Distortion)</span>
                      <span className="text-xs text-gray-500">De 0 (désactivé) à 10</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="range" 
                        min="0" 
                        max="10" 
                        step="0.5" 
                        value={config.augmentation.ocr_distortion_intensity || 0} 
                        onChange={e => setAug('ocr_distortion_intensity', parseFloat(e.target.value))} 
                        className="w-24 accent-blue-600 cursor-pointer" 
                      />
                      <span className="text-sm font-bold text-gray-700 w-8 text-right">{config.augmentation.ocr_distortion_intensity || 0}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 p-3 rounded">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-black">Bruit (Noise)</span>
                      <span className="text-xs text-gray-500">De 0 (désactivé) à 10</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="range" 
                        min="0" 
                        max="10" 
                        step="0.5" 
                        value={config.augmentation.ocr_noise_intensity || 0} 
                        onChange={e => setAug('ocr_noise_intensity', parseFloat(e.target.value))} 
                        className="w-24 accent-blue-600 cursor-pointer" 
                      />
                      <span className="text-sm font-bold text-gray-700 w-8 text-right">{config.augmentation.ocr_noise_intensity || 0}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 p-3 rounded">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-black">Flou (Blur)</span>
                      <span className="text-xs text-gray-500">De 0 (désactivé) à 10</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="range" 
                        min="0" 
                        max="10" 
                        step="0.5" 
                        value={config.augmentation.ocr_blur_intensity || 0} 
                        onChange={e => setAug('ocr_blur_intensity', parseFloat(e.target.value))} 
                        className="w-24 accent-blue-600 cursor-pointer" 
                      />
                      <span className="text-sm font-bold text-gray-700 w-8 text-right">{config.augmentation.ocr_blur_intensity || 0}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <CheckboxRow
                    label="Horizontal Flip"
                    checked={config.augmentation.flip_h}
                    onChange={(v) => setAug('flip_h', v)}
                    description="Mirror image left-right"
                  />
                  <CheckboxRow
                    label="Vertical Flip"
                    checked={config.augmentation.flip_v}
                    onChange={(v) => setAug('flip_v', v)}
                    description="Mirror image top-bottom"
                  />
                  <CheckboxRow
                    label="Both Flips (180°)"
                    checked={config.augmentation.flip_hv}
                    onChange={(v) => setAug('flip_hv', v)}
                    description="Rotate 180 degrees"
                  />
                  <CheckboxRow
                    label="Camera Grain"
                    checked={config.augmentation.grain}
                    onChange={(v) => setAug('grain', v)}
                    description="Add subtle photographic grain"
                  />
                  <CheckboxRow
                    label="Salt & Pepper / Gaussian Noise"
                    checked={config.augmentation.noise}
                    onChange={(v) => setAug('noise', v)}
                    description="Add random pixel noise"
                  />
                  <CheckboxRow
                    label="Gaussian Blur"
                    checked={config.augmentation.blur}
                    onChange={(v) => setAug('blur', v)}
                    description="Slightly blur the image"
                  />
                </>
              )}
            </div>

            <p className="mt-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
              ℹ <strong>Note:</strong> Data augmentation applies strictly to the <strong>Training</strong> set (<code>train/</code>). Validation (<code>valid/</code>) and Test (<code>test/</code>) sets will contain <strong>only original un-augmented images</strong> to ensure unbiased evaluation.
            </p>
            {isOCR && (
              <p className="mt-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                ℹ For OCR projects, augmentation applies to images only — no coordinate adjustments.
              </p>
            )}
            {projectInfo?.type === 'Classification' && (
              <p className="mt-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                ℹ For Classification projects, augmentation applies to images only — class labels are preserved.
              </p>
            )}
          </>
        )}
      </SectionCard>

      {/* ── Section 5: Generate ───────────────────────────────────────────── */}
      <div className="bg-white border rounded shadow-md p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-black mb-1">Generate & Download</h3>
            <p className="text-sm text-gray-500">
              Produces a <code>.zip</code> file with images, labels{isYolo ? ', and a <code>data.yaml</code>' : ''} ready for training.
            </p>
            {config.split_enabled && splitValid && (
              <p className="text-xs text-gray-500 mt-1">
                ZIP structure: <code>train/</code>, <code>valid/</code>, <code>test/</code> folders.
              </p>
            )}
            {config.aug_enabled && (
              <p className="text-xs text-gray-500 mt-1">
                {config.split_enabled && splitValid
                  ? `Training set images produce ${config.augmentation.num_augs} augmented copies each (total ~${Math.round(labeledCount * (config.train_pct / 100)) * (1 + config.augmentation.num_augs) + Math.round(labeledCount * ((config.val_pct + config.test_pct) / 100))} images; Test & Val are un-augmented).`
                  : `Each image will produce ${config.augmentation.num_augs} augmented copies (total ~${labeledCount * (1 + config.augmentation.num_augs)} images).`}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-3 w-full max-w-md">
            <div className="flex gap-3">

            {generatedFile ? (
              <>
                <button
                  onClick={() => setGeneratedFile(null)}
                  className="px-4 py-3 rounded font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 transition"
                >
                  Clear
                </button>
                <a
                  href={generatedFile.url}
                  download={generatedFile.filename}
                  onClick={handleDownloadClick}
                  className="flex items-center gap-2 px-6 py-3 rounded font-bold text-white text-base bg-green-600 hover:bg-green-700 transition"
                >
                  ⬇️ Save / Download ZIP
                </a>
              </>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={isGenerating || labeledCount === 0 || (config.split_enabled && !splitValid)}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded font-bold text-white text-base transition ${
                  isGenerating || labeledCount === 0 || (config.split_enabled && !splitValid)
                    ? 'bg-gray-400 cursor-not-allowed w-40'
                    : 'bg-blue-600 hover:bg-blue-700 w-auto'
                }`}
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>📦 Generate Dataset</>
                )}
              </button>
            )}
            </div>
            
            {isGenerating && progressData && (
              <div className="w-full mt-2">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Progress: {progressData.current} / {progressData.total}</span>
                  <span>
                    {(() => {
                      const elapsedMs = Date.now() - progressData.startTime;
                      const elapsedStr = new Date(elapsedMs).toISOString().substr(14, 5);
                      let etaStr = '--:--';
                      if (progressData.current > 0) {
                        const msPerItem = elapsedMs / progressData.current;
                        const remainingMs = msPerItem * (progressData.total - progressData.current);
                        if (isFinite(remainingMs) && remainingMs >= 0) {
                          etaStr = new Date(remainingMs).toISOString().substr(14, 5);
                        }
                      }
                      return `Elapsed: ${elapsedStr} | ETA: ${etaStr}`;
                    })()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                    style={{ width: `${Math.min(100, Math.max(0, (progressData.current / progressData.total) * 100))}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {labeledCount === 0 && !isLoadingStats && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded px-4 py-2 text-sm text-red-700">
            ⛔ Cannot generate dataset: no labeled images found in this project.
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
