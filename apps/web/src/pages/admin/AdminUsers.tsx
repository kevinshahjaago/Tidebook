import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { User, UserRole } from "@tidebook/shared";
import { Plus, LogOut } from "lucide-react";

export default function AdminUsers() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", role: UserRole.REGISTRAR });

  const { data } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<{ users: User[] }>("/admin/users").then((r) => r.data.users),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/admin/users", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setCreating(false); setForm({ email: "", password: "", role: UserRole.REGISTRAR }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<User> }) => api.patch(`/admin/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const forceLogoutMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/force-logout`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const roleColors: Record<UserRole, string> = {
    [UserRole.ADMIN]: "bg-purple-100 text-purple-800",
    [UserRole.REGISTRAR]: "bg-aqua-100 text-aqua-800",
    [UserRole.CONNECTIONS_COORDINATOR]: "bg-blue-100 text-blue-800",
    [UserRole.READ_ONLY]: "bg-gray-100 text-gray-600",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {creating && (
        <div className="card mb-4">
          <h2 className="font-semibold mb-4">New Staff User</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label text-xs">Email</label>
              <input type="email" className="input text-sm" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Temporary Password (min 12 chars)</label>
              <input type="password" className="input text-sm" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Role</label>
              <select className="input text-sm" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}>
                {Object.values(UserRole).map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="btn-primary text-sm px-4 py-2">Create</button>
            <button onClick={() => setCreating(false)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-700">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Role</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Last Login</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data?.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${roleColors[user.role]}`}>{user.role.replace(/_/g, " ")}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${user.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateMutation.mutate({ id: user.id, data: { isActive: !user.isActive } })}
                      className="text-xs text-gray-600 hover:text-gray-900 underline"
                    >
                      {user.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => forceLogoutMutation.mutate(user.id)}
                      className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                      title="Force logout (revokes all sessions)"
                    >
                      <LogOut className="h-3 w-3" />
                      Force logout
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
