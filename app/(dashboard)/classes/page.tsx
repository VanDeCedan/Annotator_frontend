'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ColorPicker } from '@/components/ui/ColorPicker';
import api from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function ClassesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdStr = searchParams.get('project');
  const projectId = projectIdStr ? Number(projectIdStr) : null;

  const [projects, setProjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [projectInfo, setProjectInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const { user, showToast } = useAppStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({ selectedProjectId: '', label: '', color: '#ef4444' });

  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; id: number | null; force: boolean }>({
    isOpen: false,
    id: null,
    force: false,
  });

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (!projectId) {
        const res = await api.get('/projects');
        setProjects(res.data);
      } else {
        const [pRes, cRes] = await Promise.all([
          api.get('/projects'),
          api.get(`/projects/${projectId}/classes`),
        ]);
        const proj = pRes.data.find((p: any) => p.id === projectId);
        if (proj) setProjectInfo(proj);
        setProjects(pRes.data);
        setClasses(cRes.data);
      }
    } catch {
      showToast('Failed to load data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const targetProjectId = projectId || formData.selectedProjectId;
    if (!targetProjectId) {
      showToast('Please select a project', 'error');
      setIsSubmitting(false);
      return;
    }

    const payload = { label: formData.label, color: formData.color };

    try {
      if (editingId) {
        await api.put(`/projects/${targetProjectId}/classes/${editingId}`, payload);
        showToast('Class updated', 'success');
      } else {
        await api.post(`/projects/${targetProjectId}/classes`, [payload]);
        showToast('Class created', 'success');
      }
      setIsModalOpen(false);
      
      if (!projectId) {
         router.push(`/classes?project=${targetProjectId}`);
      } else {
         loadData();
      }
      
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Operation failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDialog.id || !projectId) return;
    try {
      await api.delete(`/projects/${projectId}/classes/${confirmDialog.id}?force=${confirmDialog.force}`);
      showToast('Class deleted', 'success');
      loadData();
      setConfirmDialog({ isOpen: false, id: null, force: false });
    } catch (err: any) {
      if (err.response?.status === 409) {
        setConfirmDialog({ isOpen: true, id: confirmDialog.id, force: true });
      } else {
        showToast(err.response?.data?.detail || 'Failed to delete', 'error');
        setConfirmDialog({ isOpen: false, id: null, force: false });
      }
    }
  };

  const openModal = (cls?: any) => {
    if (cls) {
      setEditingId(cls.id);
      setFormData({ 
        selectedProjectId: projectId ? String(projectId) : '', 
        label: cls.label, 
        color: cls.color 
      });
    } else {
      setEditingId(null);
      // Automatically select the first non-OCR project if on the root page
      const eligibleProjects = projects.filter(p => p.type !== 'Ocr');
      setFormData({ 
        selectedProjectId: projectId ? String(projectId) : (eligibleProjects.length > 0 ? String(eligibleProjects[0].id) : ''), 
        label: '', 
        color: '#ef4444' 
      });
    }
    setIsModalOpen(true);
  };

  const projectColumns = [
    { header: 'Project Name', accessorKey: 'name' as const },
    {
      header: 'Type',
      cell: (row: any) => (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
          {row.type}
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: (row: any) => (
        <Button size="sm" variant="secondary" onClick={() => router.push(`/classes?project=${row.id}`)}>
          Edit Classes
        </Button>
      ),
    },
  ];

  const classColumns = [
    {
      header: 'Code',
      cell: (row: any) => (
        <span className="font-mono bg-gray-100 border px-2 py-0.5 rounded text-xs">{row.code}</span>
      ),
    },
    { header: 'Label', accessorKey: 'label' as const },
    {
      header: 'Color',
      cell: (row: any) => (
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border border-gray-300" style={{ backgroundColor: row.color }} />
          <span className="text-xs text-gray-500 uppercase">{row.color}</span>
        </div>
      ),
    },
    {
      header: 'Actions',
      cell: (row: any) =>
        user?.role === 'admin' ? (
          <div className="flex gap-2">
            <Button size="sm" variant="warning" onClick={() => openModal(row)}>Edit</Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmDialog({ isOpen: true, id: row.id, force: false })}>
              Delete
            </Button>
          </div>
        ) : null,
    },
  ];

  if (projectId && projectInfo?.type === 'Ocr') {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-black mb-4">OCR Projects don&apos;t use predefined classes.</h2>
        <Button onClick={() => router.push(`/annotator?project=${projectId}`)}>Go to Annotator Setup</Button>
      </div>
    );
  }

  return (
    <div className="text-black">
      {projectId && (
        <button onClick={() => router.push('/classes')} className="text-sm text-blue-600 hover:text-blue-800 mb-4 inline-flex items-center gap-1 font-medium">
          ← Back to All Projects
        </button>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">
            {!projectId ? 'Classes by Project' : `Classes — ${projectInfo?.name || 'Loading...'}`}
          </h2>
          <p className="text-sm text-gray-500">
            {!projectId ? 'Select a project to manage its annotation classes' : 'Manage annotation classes and colors'}
          </p>
        </div>
        <div className="flex gap-2">
          {projectId && (
            <Button variant="secondary" onClick={() => router.push(`/annotator?project=${projectId}`)}>
              Images &amp; Annotation
            </Button>
          )}
          {user?.role === 'admin' && (
            <Button onClick={() => openModal()}>+ Create Class</Button>
          )}
        </div>
      </div>

      {!projectId ? (
         <Table columns={projectColumns} data={projects} isLoading={isLoading} emptyMessage="No projects available." />
      ) : (
         <Table columns={classColumns} data={classes} isLoading={isLoading} emptyMessage="No classes yet. Add your first class!" />
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingId ? 'Edit Class' : 'Create Class'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {!projectId && !editingId && (
            <Select
              label="Select Project"
              value={formData.selectedProjectId}
              onChange={(e) => setFormData({ ...formData, selectedProjectId: e.target.value })}
              options={projects
                .filter(p => p.type !== 'Ocr')
                .map(p => ({ value: String(p.id), label: p.name }))}
              required
            />
          )}
          <Input
            label="Class Label"
            value={formData.label}
            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
            required
            placeholder="e.g. Car, Pedestrian, Logo"
          />
          <ColorPicker
            label="Class Color (Hexadecimal)"
            color={formData.color}
            onChange={(c) => setFormData({ ...formData, color: c })}
          />
          <div className="pt-4 flex justify-end gap-2 border-t border-gray-200">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, id: null, force: false })}
        onConfirm={handleDelete}
        title={confirmDialog.force ? 'Force Delete Class' : 'Delete Class'}
        message={
          confirmDialog.force
            ? 'WARNING: There are existing annotations using this class. Force deleting will also permanently delete those annotations. Are you sure?'
            : 'Are you sure you want to delete this class?'
        }
        confirmText={confirmDialog.force ? 'Force Delete' : 'Delete'}
        isDestructive
      />
    </div>
  );
}
