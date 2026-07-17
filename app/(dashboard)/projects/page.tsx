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
  const [formData, setFormData] = useState({ name: '', type: 'Yolo' });

  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; id: number | null }>({
    isOpen: false,
    id: null,
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

  const openModal = (project?: any) => {
    if (project) {
      setEditingId(project.id);
      setFormData({ name: project.name, type: project.type });
    } else {
      setEditingId(null);
      setFormData({ name: '', type: 'Yolo' });
    }
    setIsModalOpen(true);
  };

  const columns = [
    { header: 'ID', accessorKey: 'id' as const },
    {
      header: 'Name',
      cell: (row: any) => (
        <button
          onClick={() => router.push(`/classes?project=${row.id}`)}
          className="font-bold text-blue-600 hover:underline text-left"
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
          <Button size="sm" variant="primary" onClick={() => router.push(`/classes?project=${row.id}`)}>
            Manage
          </Button>
          {user?.role === 'admin' && (
            <>
              <Button size="sm" variant="warning" onClick={() => openModal(row)}>
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirmDialog({ isOpen: true, id: row.id })}>
                Deactivate
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
            ]}
          />
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

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, id: null })}
        onConfirm={handleDeactivate}
        title="Deactivate Project"
        message="Are you sure you want to deactivate this project? Users will no longer see it."
        confirmText="Deactivate"
        isDestructive
      />
    </div>
  );
}
