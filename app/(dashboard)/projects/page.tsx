'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import api from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, showToast } = useAppStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', type: 'Yolo', ocr_charset: '' });

  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; id: number | null }>({
    isOpen: false,
    id: null,
  });

  // Hard-delete dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    project: any | null;
    nameInput: string;
    isDeleting: boolean;
  }>({
    isOpen: false,
    project: null,
    nameInput: '',
    isDeleting: false,
  });

  // Auto-annotate dialog state
  const [autoAnnotateDialog, setAutoAnnotateDialog] = useState<{
    isOpen: boolean;
    project: any | null;
    file: File | null;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    project: null,
    file: null,
    isSubmitting: false,
  });

  // Progress tracking state (SSE)
  const [activeProgressProjectId, setActiveProgressProjectId] = useState<number | null>(null);
  const [progressData, setProgressData] = useState<{ total: number; current: number; status: string } | null>(null);

  const loadProjects = async () => {
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch {
      showToast('Failed to load projects', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadProjects();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/projects/${editingId}`, formData);
        showToast('Project updated', 'success');
      } else {
        await api.post('/projects', formData);
        showToast('Project created', 'success');
      }
      setIsModalOpen(false);
      loadProjects();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Operation failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDialog.id) return;
    try {
      await api.patch(`/projects/${confirmDialog.id}/deactivate`);
      showToast('Project deactivated', 'success');
      loadProjects();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed', 'error');
    } finally {
      setConfirmDialog({ isOpen: false, id: null });
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.project) return;
    setDeleteDialog((d) => ({ ...d, isDeleting: true }));
    try {
      await api.delete(`/projects/${deleteDialog.project.id}`);
      showToast(`Project "${deleteDialog.project.name}" permanently deleted`, 'success');
      setDeleteDialog({ isOpen: false, project: null, nameInput: '', isDeleting: false });
      loadProjects();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete project', 'error');
      setDeleteDialog((d) => ({ ...d, isDeleting: false }));
    }
  };

  const handleAutoAnnotate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!autoAnnotateDialog.project || !autoAnnotateDialog.file) return;

    setAutoAnnotateDialog((d) => ({ ...d, isSubmitting: true }));
    const formData = new FormData();
    formData.append('file', autoAnnotateDialog.file);

    try {
      setAutoAnnotateDialog({ isOpen: false, project: null, file: null, isSubmitting: false });
      setActiveProgressProjectId(autoAnnotateDialog.project.id);
      setProgressData({ total: 1, current: 0, status: 'processing' });
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${autoAnnotateDialog.project.id}/auto-annotate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to start inference stream');
      }

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            if (part.startsWith('data: ')) {
              const dataStr = part.replace('data: ', '').trim();
              if (dataStr) {
                try {
                  const data = JSON.parse(dataStr);
                  if (data.status === 'processing') {
                    setProgressData(data);
                  } else if (data.status === 'completed') {
                    setProgressData(null);
                    setActiveProgressProjectId(null);
                    showToast('Auto-annotation completed successfully!', 'success');
                  } else if (data.status === 'error') {
                    setProgressData(null);
                    setActiveProgressProjectId(null);
                    showToast(`Auto-annotation failed: ${data.error}`, 'error');
                  }
                } catch (e) {
                  console.error("Error parsing SSE data", e);
                }
              }
            }
          }
        }
      }

    } catch (err: any) {
      showToast(err.response?.data?.detail || err.message || 'Failed to start auto-annotation', 'error');
      setAutoAnnotateDialog((d) => ({ ...d, isSubmitting: false }));
      setActiveProgressProjectId(null);
      setProgressData(null);
    }
  };

  const openModal = (project?: any) => {
    if (project) {
      setEditingId(project.id);
      setFormData({ name: project.name, type: project.type, ocr_charset: project.ocr_charset || '' });
    } else {
      setEditingId(null);
      setFormData({ name: '', type: 'Yolo', ocr_charset: '' });
    }
    setIsModalOpen(true);
  };

  const openDeleteDialog = (project: any) => {
    setDeleteDialog({ isOpen: true, project, nameInput: '', isDeleting: false });
  };

  const deleteNameMatches =
    deleteDialog.project && deleteDialog.nameInput === deleteDialog.project.name;

  const columns = [
    { header: 'ID', accessorKey: 'id' as const },
    {
      header: 'Name',
      cell: (row: any) => (
        <button
          onClick={() => {
            if (row.type !== 'Deskewer') {
              router.push(`/classes?project=${row.id}`);
            }
          }}
          className={`font-bold text-left ${row.type === 'Deskewer' ? 'text-gray-900 cursor-default' : 'text-blue-600 hover:underline'}`}
        >
          {row.name}
        </button>
      ),
    },
    {
      header: 'Type',
      cell: (row: any) => (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
          {row.type}
        </span>
      ),
    },
    {
      header: 'Created',
      cell: (row: any) => new Date(row.created_at).toLocaleDateString(),
    },
    {
      header: 'Actions',
      cell: (row: any) => (
        <div className="flex gap-2">
          {row.type !== 'Deskewer' && (
            <Button size="sm" variant="primary" onClick={() => router.push(`/classes?project=${row.id}`)}>
              Manage
            </Button>
          )}
          {user?.role === 'admin' && (
            <>
              <Button size="sm" variant="outline" onClick={() => setAutoAnnotateDialog({ isOpen: true, project: row, file: null, isSubmitting: false })}>
                Auto-Annotate
              </Button>
              <Button size="sm" variant="warning" onClick={() => openModal(row)}>
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirmDialog({ isOpen: true, id: row.id })}>
                Deactivate
              </Button>
              <Button size="sm" variant="danger" onClick={() => openDeleteDialog(row)}>
                Delete
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="text-black">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Projects</h2>
        {user?.role === 'admin' && (
          <Button onClick={() => openModal()}>+ New Project</Button>
        )}
      </div>

      <Table columns={columns} data={projects} isLoading={isLoading} emptyMessage="No projects yet. Create your first project!" />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingId ? 'Edit Project' : 'New Project'}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Project Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Select
            label="Project Type"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            disabled={!!editingId}
            options={[
              { value: 'Yolo', label: 'YOLO — Bounding Box' },
              { value: 'Yolo OBB', label: 'YOLO OBB — Oriented Bounding Box' },
              { value: 'Classification', label: 'Image Classification' },
              { value: 'Ocr', label: 'OCR — Text Transcription' },
              { value: 'Deskewer', label: 'Deskewer — Image Straightening' },
            ]}
          />
          {formData.type === 'Ocr' && (
            <Input
              label="Allowed Charset (Optional)"
              value={formData.ocr_charset}
              onChange={(e) => setFormData({ ...formData, ocr_charset: e.target.value })}
              placeholder="e.g. 0123456789ABCDEF"
            />
          )}
          {!!editingId && (
            <p className="text-xs text-yellow-600">⚠ Project type cannot be changed after creation.</p>
          )}
          <div className="pt-3 flex justify-end gap-2 border-t border-gray-200">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate ConfirmDialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, id: null })}
        onConfirm={handleDeactivate}
        title="Deactivate Project"
        message="Are you sure you want to deactivate this project? Users will no longer see it."
        confirmText="Deactivate"
        isDestructive
      />

      {/* Hard-Delete Modal — requires typing the project name */}
      <Modal
        isOpen={deleteDialog.isOpen}
        onClose={() => !deleteDialog.isDeleting && setDeleteDialog({ isOpen: false, project: null, nameInput: '', isDeleting: false })}
        title="Permanently Delete Project"
      >
        <div className="space-y-4">
          {/* Warning banner */}
          <div className="flex gap-3 p-3 bg-red-50 border border-red-300 rounded-lg">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div>
              <p className="text-sm font-bold text-red-700">This action is irreversible.</p>
              <p className="text-sm text-red-600 mt-0.5">
                All annotations, classes, and images stored on the server for{' '}
                <span className="font-semibold">"{deleteDialog.project?.name}"</span>{' '}
                will be permanently deleted from the database and disk.
              </p>
            </div>
          </div>

          {/* Name confirmation input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Type the project name to confirm:{' '}
              <span className="font-mono text-red-600 select-none">{deleteDialog.project?.name}</span>
            </label>
            <input
              type="text"
              value={deleteDialog.nameInput}
              onChange={(e) => setDeleteDialog((d) => ({ ...d, nameInput: e.target.value }))}
              placeholder="Enter project name exactly…"
              disabled={deleteDialog.isDeleting}
              className={`w-full border rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 transition-colors ${
                deleteDialog.nameInput === ''
                  ? 'border-gray-300 focus:ring-blue-400'
                  : deleteNameMatches
                  ? 'border-green-400 bg-green-50 focus:ring-green-400'
                  : 'border-red-400 bg-red-50 focus:ring-red-400'
              }`}
              autoComplete="off"
              spellCheck={false}
            />
            {deleteDialog.nameInput !== '' && !deleteNameMatches && (
              <p className="text-xs text-red-500 mt-1">Name does not match — check capitalisation.</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <Button
              variant="ghost"
              onClick={() => setDeleteDialog({ isOpen: false, project: null, nameInput: '', isDeleting: false })}
              disabled={deleteDialog.isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={!deleteNameMatches || deleteDialog.isDeleting}
              isLoading={deleteDialog.isDeleting}
            >
              Delete Forever
            </Button>
          </div>
        </div>
      </Modal>

      {/* Auto Annotate Modal */}
      <Modal
        isOpen={autoAnnotateDialog.isOpen}
        onClose={() => !autoAnnotateDialog.isSubmitting && setAutoAnnotateDialog({ isOpen: false, project: null, file: null, isSubmitting: false })}
        title={`Auto-Annotate: ${autoAnnotateDialog.project?.name}`}
      >
        <form onSubmit={handleAutoAnnotate} className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload an ONNX model to automatically generate pre-labels for unannotated and skipped images. This process runs in the background.
          </p>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ONNX Model File</label>
            <input
              type="file"
              accept=".onnx"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setAutoAnnotateDialog((d) => ({ ...d, file }));
              }}
              required
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAutoAnnotateDialog({ isOpen: false, project: null, file: null, isSubmitting: false })}
              disabled={autoAnnotateDialog.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={autoAnnotateDialog.isSubmitting} disabled={!autoAnnotateDialog.file}>
              Start Inference
            </Button>
          </div>
        </form>
      </Modal>

      {/* Progress Modal */}
      <Modal
        isOpen={!!activeProgressProjectId}
        onClose={() => {}} // Disallow close from overlay click to avoid accidental hide
        title="Auto-Annotation Progress"
      >
        <div className="space-y-4 text-center py-4">
          <p className="text-sm text-gray-600">Please wait while the model processes your images...</p>
          
          {progressData ? (
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
                <div 
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300" 
                  style={{ width: `${progressData.total > 0 ? (progressData.current / progressData.total) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="text-xs font-bold text-gray-700">
                {progressData.current} / {progressData.total} images processed
              </p>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
