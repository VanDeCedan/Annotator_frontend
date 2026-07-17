'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function AnnotatorSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project');

  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  
  const [projectInfo, setProjectInfo] = useState<any>(null);
  const [stats, setStats] = useState({ labeled: 0 });
  const { user, showToast } = useAppStore();

  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPrelabels, setIsUploadingPrelabels] = useState(false);
  
  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
      loadProject(projectId);
      loadStats(projectId);
    }
    loadAllProjects();
  }, [projectId]);

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

  const loadStats = async (id: string) => {
    try {
      const res = await api.get(`/projects/${id}/labels/progress/`);
      setStats({ labeled: res.data.labeled_count });
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

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploading(true);
    const formData = new FormData();
    Array.from(e.target.files).forEach((file) => formData.append('files', file));
    try {
      const res = await api.post(`/projects/${projectId}/images/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { session_id, image_names } = res.data;
      const imgQuery = image_names.join(',');
      router.push(`/annotate/${projectId}/0?session=${session_id}&images=${encodeURIComponent(imgQuery)}`);
      showToast('Images uploaded. Starting session.', 'success');
    } catch {
      showToast('Failed to upload images', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadPrelabels = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploadingPrelabels(true);
    const formData = new FormData();
    Array.from(e.target.files).forEach((file) => formData.append('files', file));
    try {
      await api.post(`/projects/${projectId}/prelabels`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast('Prelabels uploaded successfully', 'success');
    } catch (err: any) {
      showToast('Failed to upload prelabels', 'error');
    } finally {
      setIsUploadingPrelabels(false);
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

  if (!projectInfo) {
    return (
      <div className="text-black max-w-3xl mx-auto py-10">
        <div className="bg-white border rounded shadow-md p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Select a Project</h2>
          <p className="text-gray-500 mb-6">Choose a project to start annotating images</p>
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
    <div className="text-black max-w-3xl">
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
                Labeled images: <strong className="text-black">{stats.labeled}</strong>
              </span>
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

      {/* Action 1: Upload & Annotate */}
      <div className="bg-white border rounded shadow-md p-6 mb-4">
        <h3 className="text-base font-bold mb-1">Start Annotation Session</h3>
        <p className="text-sm text-gray-500 mb-4">
          Upload a batch of images to start annotating immediately. Images are temporarily stored and deleted after the session.
        </p>

        <label className={`flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-gray-300 rounded cursor-pointer bg-gray-50 hover:bg-gray-100 transition ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex flex-col items-center justify-center py-6">
            <svg className="w-10 h-10 mb-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mb-1 text-sm text-gray-600">
              <span className="font-bold text-black">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-400">JPG, PNG or WEBP — multiple files allowed</p>
          </div>
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleUploadImages} disabled={isUploading} />
        </label>
        {isUploading && <p className="text-center text-blue-600 mt-2 animate-pulse text-sm">Uploading and initializing session...</p>}
      </div>

      {/* Action 2: Prelabels (admin only) */}
      {user?.role === 'admin' && (
        <div className="bg-white border rounded shadow-md p-6 mb-4">
          <h3 className="text-base font-bold mb-1">Prelabels</h3>
          <p className="text-sm text-gray-500 mb-4">
            Upload .txt files matching your image names to pre-populate annotations and speed up the workflow.
          </p>
          <div className="flex items-center gap-3">
            <label className="relative">
              <Button disabled={isUploadingPrelabels} asChild>
                <span>{isUploadingPrelabels ? 'Uploading...' : 'Upload Prelabels (.txt)'}</span>
              </Button>
              <input type="file" multiple accept=".txt" className="hidden" onChange={handleUploadPrelabels} disabled={isUploadingPrelabels} />
            </label>
            <Button variant="danger" onClick={handleDeletePrelabels}>Clear All Prelabels</Button>
          </div>
        </div>
      )}
    </div>
  );
}
