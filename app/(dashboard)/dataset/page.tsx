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
}

interface ExportConfig {
  yolo_version: string;
  resize: string;
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

  const [matchedFiles, setMatchedFiles] = useState<File[]>([]);
  const [totalSelected, setTotalSelected] = useState(0);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setTotalSelected(files.length);
    const matched = files.filter((f) => labeledImages.includes(f.name));
    setMatchedFiles(matched);
  };

  const [config, setConfig] = useState<ExportConfig>({
    yolo_version: 'v8',
    resize: '',
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

  const handleGenerate = async () => {
    if (labeledCount === 0) {
      showToast('No labeled images found for this project', 'error');
      return;
    }
    if (matchedFiles.length === 0) {
      showToast('Please upload original images that match the labeled data.', 'error');
      return;
    }
    if (config.split_enabled && !splitValid) {
      showToast('Train/Val/Test percentages must sum to 100%', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const sessionId = 'generate_' + Date.now();
      const BATCH_SIZE = 50;

      showToast(`Uploading ${matchedFiles.length} images...`, 'success');
      for (let i = 0; i < matchedFiles.length; i += BATCH_SIZE) {
        const batch = matchedFiles.slice(i, i + BATCH_SIZE);
        const formData = new FormData();
        batch.forEach((f) => formData.append('files', f));

        await api.post(`/projects/${projectId}/images/upload?session_id=${sessionId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      showToast('Images uploaded. Generating dataset (this may take a while)...', 'success');

      const payload: any = {
        session_id: sessionId,
        resize: config.resize.trim() || null,
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

      // Trigger download
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `dataset_${projectInfo?.name?.replace(/\s+/g, '_') || projectId}_${Date.now()}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast('Dataset exported successfully!', 'success');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      showToast(typeof detail === 'string' ? detail : 'Failed to generate dataset', 'error');
    } finally {
      setIsGenerating(false);
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

      {/* ── Section 1.5: Upload Original Images ─────────────────────────────── */}
      <SectionCard title="📁 Upload Original Images">
        <div className="bg-gray-50 border border-gray-200 rounded p-4">
          <p className="text-sm text-gray-600 mb-4">
            The database contains labels for {labeledCount} images. Please select the folder containing your original images.
          </p>
          <div className="flex gap-4">
            <label className="flex-1 flex flex-col items-center justify-center h-24 border-2 border-blue-300 border-dashed rounded cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors">
              <div className="flex flex-col items-center justify-center pt-2">
                <svg className="w-5 h-5 mb-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm font-bold text-blue-700">Select Files</p>
                <p className="text-xs text-blue-500 mt-1">Choose individual images</p>
              </div>
              <input type="file" className="hidden" multiple accept="image/*" onChange={handleFileSelect} />
            </label>
            <label className="flex-1 flex flex-col items-center justify-center h-24 border-2 border-green-300 border-dashed rounded cursor-pointer bg-green-50 hover:bg-green-100 transition-colors">
              <div className="flex flex-col items-center justify-center pt-2">
                <svg className="w-5 h-5 mb-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <p className="text-sm font-bold text-green-700">Select Folder</p>
                <p className="text-xs text-green-500 mt-1">Choose an entire folder</p>
              </div>
              {/* @ts-ignore */}
              <input type="file" className="hidden" multiple accept="image/*" onChange={handleFileSelect} webkitdirectory="true" directory="true" />
            </label>
          </div>

          {totalSelected > 0 && (
            <div className="mt-4 p-3 bg-white border border-gray-200 rounded">
              <p className="text-sm">
                Selected <span className="font-bold text-black">{totalSelected}</span> images.
              </p>
              <p className={`text-sm font-medium ${matchedFiles.length > 0 ? 'text-green-600' : 'text-red-600'}`}>
                Found labels for {matchedFiles.length} images. 
                {totalSelected - matchedFiles.length > 0 && ` (${totalSelected - matchedFiles.length} unlabelled images will be ignored).`}
              </p>
              {matchedFiles.length > 0 && matchedFiles.length < labeledCount && (
                <p className="text-sm text-amber-600 mt-1">
                  Warning: {labeledCount - matchedFiles.length} labeled images are missing from your selection.
                </p>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      <div className={`transition-opacity duration-300 ${matchedFiles.length > 0 ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
      {/* ── Section 2: Format Settings ────────────────────────────────────── */}
      <SectionCard title="⚙️ Format Settings">
        {/* YOLO version — only for YOLO projects */}
        {isYolo && (
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
            </div>

            {isOCR && (
              <p className="mt-3 text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                ℹ For OCR projects, augmentation applies to images only — no coordinate adjustments.
              </p>
            )}
            {projectInfo?.type === 'Classification' && (
              <p className="mt-3 text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded px-3 py-2">
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
                Each image will produce {config.augmentation.num_augs} augmented copies (total ~{labeledCount * (1 + config.augmentation.num_augs)} images).
              </p>
            )}
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || labeledCount === 0 || (config.split_enabled && !splitValid)}
            className={`flex items-center gap-2 px-6 py-3 rounded font-bold text-white text-base transition ${
              isGenerating || labeledCount === 0 || (config.split_enabled && !splitValid)
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
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
              <>📦 Generate &amp; Download</>
            )}
          </button>
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
