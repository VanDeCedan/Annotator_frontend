'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import api from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function PreLabelsPage() {
  const [summary, setSummary] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, showToast } = useAppStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; id: number | null }>({
    isOpen: false,
    id: null,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [sumRes, projRes] = await Promise.all([
        api.get('/prelabels/summary'),
        api.get('/projects'),
      ]);
      setSummary(sumRes.data);
      setProjects(projRes.data);
    } catch {
      showToast('Failed to load data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
      setValidationErrors([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      showToast('Please select a project', 'error');
      return;
    }
    if (selectedFiles.length === 0) {
      showToast('Please select at least one .txt file', 'error');
      return;
    }

    setIsSubmitting(true);
    setValidationErrors([]);
    setUploadProgress({ current: 0, total: selectedFiles.length });
    const chunkSize = 200;

    try {
      for (let i = 0; i < selectedFiles.length; i += chunkSize) {
        const chunk = selectedFiles.slice(i, i + chunkSize);
        const formData = new FormData();
        chunk.forEach((file) => formData.append('files', file));

        await api.post(`/projects/${selectedProjectId}/prelabels`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        const currentCount = Math.min(i + chunk.length, selectedFiles.length);
        setUploadProgress({ current: currentCount, total: selectedFiles.length });
      }
      showToast('Pre-labels uploaded successfully', 'success');
      setIsModalOpen(false);
      setSelectedFiles([]);
      loadData();
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.detail?.invalid_files) {
        setValidationErrors(err.response.data.detail.invalid_files);
        showToast('Validation failed for some files', 'error');
      } else {
        showToast(err.response?.data?.detail || 'Upload failed', 'error');
      }
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDialog.id) return;
    try {
      await api.delete(`/projects/${confirmDialog.id}/prelabels`);
      showToast('Pre-labels deleted', 'success');
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete pre-labels', 'error');
    } finally {
      setConfirmDialog({ isOpen: false, id: null });
    }
  };

  const openModal = () => {
    setSelectedProjectId(projects.length > 0 ? String(projects[0].id) : '');
    setSelectedFiles([]);
    setValidationErrors([]);
    setIsModalOpen(true);
  };

  const columns = [
    { header: 'Project Name', accessorKey: 'project_name' as const },
    {
      header: 'Type',
      cell: (row: any) => (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
          {row.type}
        </span>
      ),
    },
    {
      header: 'Pre-labels Count',
      cell: (row: any) => (
        <span className="font-mono bg-gray-100 border px-2 py-0.5 rounded text-xs">{row.count} files</span>
      ),
    },
    {
      header: 'Actions',
      cell: (row: any) =>
        user?.role === 'admin' ? (
          <Button size="sm" variant="danger" onClick={() => setConfirmDialog({ isOpen: true, id: row.project_id })}>
            Delete All
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="text-black">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">Pre-labels Overview</h2>
          <p className="text-sm text-gray-500">Manage uploaded pre-label files across all projects</p>
        </div>
        {user?.role === 'admin' && (
          <Button onClick={openModal}>+ Add Prelabels</Button>
        )}
      </div>

      <Table columns={columns} data={summary} isLoading={isLoading} emptyMessage="No pre-labels found." />

      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title="Upload Pre-labels"
        width="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Select Project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            options={projects.map(p => ({ value: String(p.id), label: p.name }))}
            required
          />

          <div>
            <label className="block text-sm font-medium text-black mb-1">Select Pre-label Files (.txt)</label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md bg-gray-50 hover:bg-gray-100 transition">
              <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex text-sm text-gray-600 justify-center">
                  <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 px-1">
                    <span>Upload files</span>
                    <input type="file" className="sr-only" multiple accept=".txt" onChange={handleFileChange} />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">Only .txt files are supported</p>
              </div>
            </div>
            {selectedFiles.length > 0 && (
              <p className="mt-2 text-sm text-green-600 font-medium">
                {selectedFiles.length.toLocaleString()} file(s) selected ready to upload.
              </p>
            )}
          </div>

          {isSubmitting && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex justify-between text-xs font-semibold text-blue-800 mb-1">
                <span>Uploading and validating prelabels...</span>
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

          {validationErrors.length > 0 && (
            <div className="mt-4 bg-red-50 border-l-4 border-red-400 p-4 max-h-40 overflow-y-auto">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Validation errors found in the following files:</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <ul className="list-disc pl-5 space-y-1">
                      {validationErrors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2 border-t border-gray-200">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Upload &amp; Validate</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, id: null })}
        onConfirm={handleDelete}
        title="Delete All Pre-labels"
        message="Are you sure you want to delete ALL pre-labels for this project? This action cannot be undone."
        confirmText="Delete"
        isDestructive
      />
    </div>
  );
}
