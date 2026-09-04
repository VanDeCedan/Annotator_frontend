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
  const [formData, setFormData] = useState({ name: '', type: 'Yolo', ocr_charset: '', dbnet_model_path: '', ocr_enable_class: false, model_img_h: '', model_img_w: '' });

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

  const [duplicateDialog, setDuplicateDialog] = useState<{
    isOpen: boolean;
    project: any | null;
    nameInput: string;
    duplicateData: boolean;
    isDuplicating: boolean;
  }>({
    isOpen: false,
    project: null,
    nameInput: '',
    duplicateData: false,
    isDuplicating: false,
  });


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
      const payload = {
        ...formData,
        model_img_h: formData.model_img_h ? parseInt(formData.model_img_h, 10) : null,
        model_img_w: formData.model_img_w ? parseInt(formData.model_img_w, 10) : null,
      };

      if (editingId) {
        await api.put(`/projects/${editingId}`, payload);
        showToast('Project updated', 'success');
      } else {
        await api.post('/projects', payload);
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

  const handleDuplicate = async () => {
    if (!duplicateDialog.project || !duplicateDialog.nameInput.trim()) return;
    setDuplicateDialog((d) => ({ ...d, isDuplicating: true }));
    try {
      await api.post(`/projects/${duplicateDialog.project.id}/duplicate`, {
        name: duplicateDialog.nameInput.trim(),
        duplicate_data: duplicateDialog.duplicateData
      });
      showToast(`Project duplicated successfully`, 'success');
      setDuplicateDialog({ isOpen: false, project: null, nameInput: '', duplicateData: false, isDuplicating: false });
      loadProjects();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to duplicate project', 'error');
      setDuplicateDialog((d) => ({ ...d, isDuplicating: false }));
    }
  };


  const openModal = (project?: any) => {
    if (project) {
      setEditingId(project.id);
      setFormData({ 
        name: project.name, 
        type: project.type, 
        ocr_charset: project.ocr_charset || '', 
        dbnet_model_path: project.dbnet_model_path || '',
        ocr_enable_class: !!project.ocr_enable_class,
        model_img_h: project.model_img_h ? String(project.model_img_h) : '',
        model_img_w: project.model_img_w ? String(project.model_img_w) : ''
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', type: 'Yolo', ocr_charset: '', dbnet_model_path: '', ocr_enable_class: false, model_img_h: '', model_img_w: '' });
    }
    setIsModalOpen(true);
  };

  const openDeleteDialog = (project: any) => {
    setDeleteDialog({ isOpen: true, project, nameInput: '', isDeleting: false });
  };

  const openDuplicateDialog = (project: any) => {
    setDuplicateDialog({
      isOpen: true,
      project,
      nameInput: `${project.name} - Copy`,
      duplicateData: false,
      isDuplicating: false,
    });
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
              <Button size="sm" variant="warning" onClick={() => openModal(row)}>
                Edit
              </Button>
              <Button size="sm" variant="secondary" onClick={() => openDuplicateDialog(row)}>
                Duplicate
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
              { value: 'KIE', label: 'KIE — Key Information Extraction' },
              { value: 'NER', label: 'NER — Text Named Entity Recognition' },
              { value: 'VLM', label: 'VLM — Visual Language Model' },
            ]}
          />
          {formData.type === 'Ocr' && (
            <div className="flex flex-col gap-4 mt-2">
              <Input
                label="Allowed Charset (Optional)"
                value={formData.ocr_charset}
                onChange={(e) => setFormData({ ...formData, ocr_charset: e.target.value })}
                placeholder="e.g. 0123456789ABCDEF"
              />
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={formData.ocr_enable_class || false}
                  onChange={(e) => setFormData({ ...formData, ocr_enable_class: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-300"
                />
                <span className="text-sm font-medium text-black">Enable class selection for OCR boxes</span>
              </label>
            </div>
          )}
          {(formData.type === 'Yolo' || formData.type === 'Yolo OBB' || formData.type === 'Ocr') && (
            <>
              <Input
                label="ONNX Model Path (.onnx) (Optional)"
                value={formData.dbnet_model_path}
                onChange={(e) => setFormData({ ...formData, dbnet_model_path: e.target.value })}
                placeholder={formData.type === 'Ocr' ? "e.g. data/parseq_om.onnx" : "e.g. data/best.onnx"}
              />
              <div className="flex gap-2">
                <Input
                  label="Model Img Height (Optional)"
                  type="number"
                  value={formData.model_img_h}
                  onChange={(e) => setFormData({ ...formData, model_img_h: e.target.value })}
                  placeholder="e.g. 48"
                />
                <Input
                  label="Model Img Width (Optional)"
                  type="number"
                  value={formData.model_img_w}
                  onChange={(e) => setFormData({ ...formData, model_img_w: e.target.value })}
                  placeholder="e.g. 256"
                />
              </div>
            </>
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

      {/* Duplicate Project Modal */}
      <Modal
        isOpen={duplicateDialog.isOpen}
        onClose={() => !duplicateDialog.isDuplicating && setDuplicateDialog({ isOpen: false, project: null, nameInput: '', duplicateData: false, isDuplicating: false })}
        title="Duplicate Project"
      >
        <div className="space-y-4">
          <Input
            label="New Project Name"
            value={duplicateDialog.nameInput}
            onChange={(e) => setDuplicateDialog((d) => ({ ...d, nameInput: e.target.value }))}
            required
            disabled={duplicateDialog.isDuplicating}
          />
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              id="duplicate-data"
              checked={duplicateDialog.duplicateData}
              onChange={(e) => setDuplicateDialog((d) => ({ ...d, duplicateData: e.target.checked }))}
              disabled={duplicateDialog.isDuplicating}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-300"
            />
            <label htmlFor="duplicate-data" className="text-sm font-medium text-black cursor-pointer">
              Duplicate Data (Images) too
            </label>
          </div>
          <p className="text-xs text-gray-500">
            Note: Annotations (labels) are not copied. The new project will retain the same type and classes as the original.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <Button
              variant="ghost"
              onClick={() => setDuplicateDialog({ isOpen: false, project: null, nameInput: '', duplicateData: false, isDuplicating: false })}
              disabled={duplicateDialog.isDuplicating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleDuplicate}
              disabled={duplicateDialog.nameInput.trim() === '' || duplicateDialog.isDuplicating}
              isLoading={duplicateDialog.isDuplicating}
            >
              Duplicate
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

