'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import api from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, showToast } = useAppStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', username: '', password: '', role: 'annotator' });

  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; id: number | null }>({
    isOpen: false,
    id: null,
  });

  const loadUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch {
      showToast('Failed to load users', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      loadUsers();
    } else if (user) {
      showToast('Access denied', 'error');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, formData);
        showToast('User updated', 'success');
      } else {
        await api.post('/users', formData);
        showToast('User created', 'success');
      }
      setIsModalOpen(false);
      loadUsers();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Operation failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDialog.id) return;
    try {
      await api.patch(`/users/${confirmDialog.id}/deactivate`);
      showToast('User deactivated', 'success');
      loadUsers();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed', 'error');
    } finally {
      setConfirmDialog({ isOpen: false, id: null });
    }
  };

  const openModal = (u?: any) => {
    if (u) {
      setEditingId(u.id);
      setFormData({ name: u.name, username: u.username, password: '', role: u.role });
    } else {
      setEditingId(null);
      setFormData({ name: '', username: '', password: '', role: 'annotator' });
    }
    setIsModalOpen(true);
  };

  const ROLE_BADGE: Record<string, string> = {
    admin: 'bg-blue-100 text-blue-800',
    reviewer: 'bg-purple-100 text-purple-800',
    annotator: 'bg-gray-100 text-gray-700',
  };

  const columns = [
    { header: 'ID', accessorKey: 'id' as const },
    { header: 'Name', accessorKey: 'name' as const },
    { header: 'Username', accessorKey: 'username' as const },
    {
      header: 'Role',
      cell: (row: any) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[row.role] || 'bg-gray-100 text-gray-700'}`}>
          {row.role}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (row: any) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${row.statut === 'activated' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {row.statut}
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: (row: any) => (
        <div className="flex gap-2">
          <Button size="sm" variant="warning" onClick={() => openModal(row)}>
            Edit
          </Button>
          {row.id !== user?.id && row.statut === 'activated' && (
            <Button size="sm" variant="danger" onClick={() => setConfirmDialog({ isOpen: true, id: row.id })}>
              Deactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (user?.role !== 'admin') {
    return <div className="text-black">You do not have permission to view this page.</div>;
  }

  return (
    <div className="text-black">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Users</h2>
        <Button onClick={() => openModal()}>+ New User</Button>
      </div>

      <Table columns={columns} data={users} isLoading={isLoading} />

      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingId ? 'Edit User' : 'New User'}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label="Username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
            disabled={!!editingId}
          />
          <Input
            label="Password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required={!editingId}
            placeholder={editingId ? 'Leave blank to keep unchanged' : ''}
          />
          <Select
            label="Role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            options={[
              { value: 'annotator', label: 'Annotator' },
              { value: 'reviewer', label: 'Reviewer' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
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
        title="Deactivate User"
        message="Are you sure you want to deactivate this user? They will no longer be able to log in."
        confirmText="Deactivate"
        isDestructive
      />
    </div>
  );
}
