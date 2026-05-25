"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders, getStoredUser } from "@/lib/auth";
import { CheckCircle2, Clock, Loader2, Pencil, Plus, Save, UserCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";

type UserOption = { id: string; fullName: string; email: string; role: string };
type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueDate?: string | null;
  createdAt: string;
  completedAt?: string | null;
  createdBy: { id: string; fullName: string; role: string };
  assignedTo: { id: string; fullName: string; role: string };
};
type TaskView = "assigned" | "created" | "all";
type TaskFilter = "ACTIVE" | "ALL" | Task["status"];
type FormState = {
  title: string;
  description: string;
  assignedToId: string;
  priority: Task["priority"];
  dueDate: string;
};

const statusLabels: Record<Task["status"], string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const priorityClass: Record<Task["priority"], string> = {
  LOW: "bg-slate-100 text-slate-600",
  NORMAL: "bg-blue-50 text-blue-700",
  HIGH: "bg-orange-50 text-orange-700",
  URGENT: "bg-red-50 text-red-700",
};
const priorityLabels: Record<Task["priority"], string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "Medium Important",
  URGENT: "Urgent",
};
const priorityRank: Record<Task["priority"], number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export default function TasksPage() {
  const router = useRouter();
  const [currentUser] = useState(() => getStoredUser());
  const [users, setUsers] = useState<UserOption[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<TaskView>("assigned");
  const [status, setStatus] = useState<TaskFilter>("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<FormState>({
    title: "",
    description: "",
    assignedToId: "",
    priority: "NORMAL",
    dueDate: "",
  });
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    assignedToId: currentUser?.id ?? "",
    priority: "NORMAL",
    dueDate: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view, status });
      const [taskRes, userRes] = await Promise.all([
        fetch(`${API_BASE_URL}/tasks?${params}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/tasks/users`, { headers: getAuthHeaders() }),
      ]);
      if (taskRes.status === 401) { clearAuth(); router.replace("/login"); return; }
      setTasks(taskRes.ok ? await taskRes.json() : []);
      const userList = userRes.ok ? await userRes.json() : [];
      const userOptions = currentUser && !userList.some((user: UserOption) => user.id === currentUser.id)
        ? [{ id: currentUser.id, fullName: currentUser.fullName, email: currentUser.email, role: currentUser.role }, ...userList]
        : userList;
      setUsers(userOptions);
      setForm(prev => ({ ...prev, assignedToId: prev.assignedToId || currentUser?.id || userList[0]?.id || "" }));
    } finally {
      setLoading(false);
    }
  }, [currentUser, router, status, view]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    open: tasks.filter(t => t.status === "OPEN").length,
    progress: tasks.filter(t => t.status === "IN_PROGRESS").length,
    done: tasks.filter(t => t.status === "DONE").length,
  }), [tasks]);
  const taskMatchesFilter = useCallback((task: Task) => {
    if (status === "ACTIVE") return task.status !== "DONE";
    if (status === "ALL") return true;
    return task.status === status;
  }, [status]);
  const sortedTasks = useMemo(() => (
    [...tasks].sort((a, b) => {
      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
  ), [tasks]);

  async function createTask() {
    if (!form.title.trim()) { alert("Task title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/tasks`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          assignedToId: form.assignedToId || currentUser?.id,
          priority: form.priority,
          dueDate: form.dueDate || undefined,
        }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); alert(body.message || "Could not create task"); return; }
      setForm({ title: "", description: "", assignedToId: currentUser?.id ?? "", priority: "NORMAL", dueDate: "" });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function updateTask(id: string, patch: Partial<Task>) {
    const res = await fetch(`${API_BASE_URL}/tasks/${id}`, {
      method: "PATCH",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { alert("Could not update task"); return; }
    const updated = await res.json();
    setTasks(prev => {
      const next = prev.map(task => task.id === id ? updated : task);
      return taskMatchesFilter(updated) ? next : next.filter(task => task.id !== id);
    });
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditForm({
      title: task.title,
      description: task.description ?? "",
      assignedToId: task.assignedTo.id,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
    });
  }

  async function saveEdit(taskId: string) {
    if (!editForm.title.trim()) { alert("Task title is required"); return; }
    setEditSaving(true);
    try {
      await updateTask(taskId, {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        assignedToId: editForm.assignedToId,
        priority: editForm.priority,
        dueDate: editForm.dueDate,
      } as Partial<Task>);
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <DashboardShell>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6 lg:overflow-hidden">
        <div className="flex flex-none flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Tasks</h1>
            <p className="text-sm text-slate-500">Create work, assign it to a user, and track what is assigned to you.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="font-bold text-slate-900">{counts.open}</p><p className="text-slate-500">Open</p></div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="font-bold text-blue-700">{counts.progress}</p><p className="text-slate-500">Progress</p></div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="font-bold text-green-700">{counts.done}</p><p className="text-slate-500">Done</p></div>
          </div>
        </div>

        <div className="grid min-h-0 gap-4 lg:flex-1 lg:grid-cols-[360px_1fr]">
          <div className="self-start rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-600" />
              <h2 className="font-semibold text-slate-900">New Task</h2>
            </div>
            <div className="space-y-3">
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Task title" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Details" rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Assigned To</label>
                <select value={form.assignedToId} onChange={e => setForm(p => ({ ...p, assignedToId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none">
                  {users.map(user => <option key={user.id} value={user.id}>{user.fullName} ({user.role.replace(/_/g, " ")})</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-400">Defaults to the user currently using ERP.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as Task["priority"] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none">
                  {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" />
              </div>
              <button onClick={createTask} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Task
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex flex-none flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              {[
                ["assigned", "My Assigned"],
                ["created", "Created By Me"],
                ...(currentUser?.role === "ADMIN" ? [["all", "All Tasks"]] : []),
              ].map(([key, label]) => (
                <button key={key} onClick={() => setView(key as TaskView)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</button>
              ))}
              <select value={status} onChange={e => setStatus(e.target.value as TaskFilter)} className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold outline-none">
                <option value="ACTIVE">Active Tasks</option>
                <option value="DONE">History</option>
                <option value="ALL">All Status</option>
                {Object.entries(statusLabels)
                  .filter(([value]) => value !== "DONE")
                  .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white py-20"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">{status === "DONE" ? "No completed tasks in history." : "No tasks found."}</div>
            ) : (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 pb-4">
                {sortedTasks.map(task => (
                  <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    {editingId === task.id ? (
                      <div className="space-y-3">
                        <div className="grid gap-2 md:grid-cols-[1fr_160px]">
                          <input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} placeholder="Task subject" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-400" />
                          <select value={editForm.priority} onChange={e => setEditForm(p => ({ ...p, priority: e.target.value as Task["priority"] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none">
                            {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>
                        <textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} placeholder="Task details" rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
                        <div className="grid gap-2 md:grid-cols-[1fr_160px]">
                          <select value={editForm.assignedToId} onChange={e => setEditForm(p => ({ ...p, assignedToId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none">
                            {users.map(user => <option key={user.id} value={user.id}>{user.fullName} ({user.role.replace(/_/g, " ")})</option>)}
                          </select>
                          <input type="date" value={editForm.dueDate} onChange={e => setEditForm(p => ({ ...p, dueDate: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} disabled={editSaving} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
                            <X className="h-3.5 w-3.5" /> Cancel
                          </button>
                          <button onClick={() => saveEdit(task.id)} disabled={editSaving} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                            {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900">{task.title}</h3>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityClass[task.priority]}`}>{priorityLabels[task.priority]}</span>
                          </div>
                          {task.description && <p className="text-sm text-slate-500">{task.description}</p>}
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> Assigned: {task.assignedTo.fullName}</span>
                            <span>Created: {task.createdBy.fullName}</span>
                            {task.dueDate && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Due {new Date(task.dueDate).toLocaleDateString("en-IN")}</span>}
                            {task.completedAt && <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Completed {new Date(task.completedAt).toLocaleDateString("en-IN")}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(task)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          <select value={task.status} onChange={e => updateTask(task.id, { status: e.target.value as Task["status"] })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold outline-none">
                            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <button onClick={() => updateTask(task.id, { status: "DONE" })} disabled={task.status === "DONE"} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
