"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Loader2, Database, Search, Trash2, Edit2, Check, X, Play, ChevronLeft, ChevronRight } from "lucide-react";

const TABLE_LABELS: Record<string, string> = {
  user: "Users", customer: "Customers", product: "Products",
  productCategory: "Product Categories", productCostSlab: "Cost Slabs",
  commissionRule: "Commission Rules", paymentAccount: "Payment Accounts",
  vendor: "Vendors", jobWork: "Job Works", printSheet: "Print Sheets",
  printSheetItem: "Sheet Items", sheetStageVendor: "Sheet Stage Vendors",
  itemStageLog: "Item Stage Logs", godown: "Godown", order: "Orders",
  orderItem: "Order Items", payment: "Payments", invoice: "Invoices",
  commission: "Commissions", productionJob: "Production Jobs",
  shipment: "Shipments", statusLog: "Status Logs",
};

const PROTECTED = ["user", "order", "payment"];

export default function AdminDbPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tableLoading, setTableLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [sql, setSql] = useState("");
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"tables" | "query">("tables");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addData, setAddData] = useState<Record<string, string>>({});
  const [addLoading, setAddLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const LIMIT = 50;

  useEffect(() => {
    // Check admin role
    try {
      const raw = localStorage.getItem("rareprint_user");
      const user = raw ? JSON.parse(raw) : null;
      if (!user || user.role !== "ADMIN") { router.replace("/dashboard"); return; }
    } catch { router.replace("/login"); return; }

    fetch(`${API_BASE_URL}/admin/db/tables`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => { setTables(d.tables || []); setCounts(d.counts || {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, [router]);

  const loadTable = useCallback(async (name: string, p = 1) => {
    setTableLoading(true);
    setActiveTable(name);
    setPage(p);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/db/table/${name}?page=${p}&limit=${LIMIT}`, { headers: getAuthHeaders() });
      const d = await res.json();
      setRows(d.rows || []);
      setTotal(d.total || 0);
    } finally { setTableLoading(false); }
  }, []);

  const saveEdit = async (id: string) => {
    if (!activeTable) return;
    const res = await fetch(`${API_BASE_URL}/admin/db/table/${activeTable}/${id}`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(editData),
    });
    const d = await res.json();
    if (d.success) { setEditingRow(null); loadTable(activeTable, page); }
    else alert(d.error || "Update failed");
  };

  const deleteRow = async (id: string) => {
    if (!activeTable || !confirm("Delete this record? This cannot be undone.")) return;
    const res = await fetch(`${API_BASE_URL}/admin/db/table/${activeTable}/${id}`, {
      method: "DELETE", headers: getAuthHeaders(),
    });
    const d = await res.json();
    if (d.success) loadTable(activeTable, page);
    else alert(d.error || "Delete failed");
  };

  const runSql = async () => {
    if (!sql.trim()) return;
    setSqlLoading(true); setSqlResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/db/query`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      setSqlResult(await res.json());
    } finally { setSqlLoading(false); }
  };

  const addRecord = async () => {
    if (!activeTable) return;
    setAddLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/db/table/${activeTable}`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(addData),
      });
      const d = await res.json();
      if (d.success) { setShowAddModal(false); setAddData({}); loadTable(activeTable, page); }
      else alert(d.error || "Add failed");
    } finally { setAddLoading(false); }
  };

  const bulkImport = async () => {
    if (!activeTable || !importJson.trim()) return;
    setImportLoading(true); setImportResult(null);
    try {
      let records: any[];
      try { records = JSON.parse(importJson); } catch { setImportResult("Invalid JSON"); setImportLoading(false); return; }
      if (!Array.isArray(records)) records = [records];
      let ok = 0; let fail = 0;
      for (const rec of records) {
        // Strip nested objects/arrays, id, createdAt, updatedAt, and relation names before sending
        const relationNames = ['category', 'customer', 'order', 'product', 'vendor', 'agent', 'salesAgent', 'changedBy', 'sheet', 'orderItem', 'paymentAccount', 'costSlabs', 'items', 'stageVendors', 'jobWorks', 'payments', 'shipments', 'statusLogs'];
        const cleaned: Record<string, any> = {};
        for (const [k, v] of Object.entries(rec)) {
          if (k === 'id' || k === 'createdAt' || k === 'updatedAt') continue;
          if (relationNames.includes(k)) continue; // skip relation name fields
          if (v !== null && typeof v === 'object') continue; // skip nested objects
          cleaned[k] = v;
        }
        const res = await fetch(`${API_BASE_URL}/admin/db/table/${activeTable}`, {
          method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(cleaned),
        });
        const d = await res.json();
        if (d.success) ok++; else fail++;
      }
      setImportResult(`Imported ${ok} records. Failed: ${fail}`);
      loadTable(activeTable, page);
    } finally { setImportLoading(false); }
  };

  const filteredRows = search
    ? rows.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))
    : rows;

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const totalPages = Math.ceil(total / LIMIT);

  if (loading) return (
    <>
      <DashboardShell>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardShell>
    </>
  );

  return (
    <>
      <DashboardShell>
      <div className="flex h-full" style={{ height: "calc(100vh - 0px)" }}>
        {/* Sidebar - table list */}
        <div className="w-52 border-r border-slate-200 bg-white overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-bold text-slate-800">Database</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Railway PostgreSQL</p>
          </div>
          <div className="p-2 space-y-0.5">
            {tables.map(t => (
              <button key={t} onClick={() => { setActiveTab("tables"); loadTable(t); }}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${activeTable === t && activeTab === "tables" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <span className="truncate">{TABLE_LABELS[t] || t}</span>
                <span className={`rounded-full px-1.5 text-xs font-semibold ${activeTable === t && activeTab === "tables" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {counts[t] ?? 0}
                </span>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-slate-100">
            <button onClick={() => { setActiveTab("query"); setActiveTable(null); }}
              className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition-colors ${activeTab === "query" ? "bg-purple-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <Play className="h-3 w-3" /> SQL Query
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "query" ? (
            <div className="p-4 flex flex-col h-full">
              <h2 className="text-sm font-bold text-slate-800 mb-2">Raw SQL Query</h2>
              <p className="text-xs text-red-500 mb-2">⚠️ DROP, TRUNCATE, ALTER are blocked. Be careful with UPDATE/DELETE.</p>
              <textarea value={sql} onChange={e => setSql(e.target.value)}
                placeholder="SELECT * FROM &quot;Order&quot; LIMIT 10;"
                className="w-full h-32 rounded-lg border border-slate-200 p-3 text-xs font-mono resize-none outline-none focus:border-blue-400 bg-slate-900 text-green-400"
              />
              <button onClick={runSql} disabled={sqlLoading}
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-60 w-fit">
                {sqlLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run Query
              </button>
              {sqlResult && (
                <div className="mt-3 flex-1 overflow-auto">
                  {sqlResult.error ? (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-mono">{sqlResult.error}</div>
                  ) : (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">{sqlResult.count} row(s) returned</p>
                      <div className="rounded-lg border border-slate-200 overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>{sqlResult.rows?.[0] && Object.keys(sqlResult.rows[0]).map((k: string) => (
                              <th key={k} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{k}</th>
                            ))}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {sqlResult.rows?.map((r: any, i: number) => (
                              <tr key={i} className="hover:bg-slate-50">
                                {Object.values(r).map((v: any, j: number) => (
                                  <td key={j} className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-xs truncate">
                                    {v === null ? <span className="text-slate-300">NULL</span> : String(v)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTable ? (
            <div className="flex flex-col h-full">
              {/* Table header */}
              <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold text-slate-800">{TABLE_LABELS[activeTable] || activeTable}</h2>
                  <span className="text-xs text-slate-400">{total} records</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setAddData({}); setShowAddModal(true); }}
                    className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">
                    + Add Record
                  </button>
                  <button onClick={() => { setImportJson(""); setImportResult(null); setShowImportModal(true); }}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700">
                    ↑ Bulk Import
                  </button>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Filter rows..." className="pl-6 pr-3 py-1 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-400 w-48" />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <button onClick={() => page > 1 && loadTable(activeTable, page - 1)} disabled={page <= 1}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
                    <span>{page}/{totalPages || 1}</span>
                    <button onClick={() => page < totalPages && loadTable(activeTable, page + 1)} disabled={page >= totalPages}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>

              {/* Table data */}
              {tableLoading ? (
                <div className="flex items-center justify-center flex-1"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">Actions</th>
                        {columns.map(col => (
                          <th key={col} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {editingRow === row.id ? (
                              <div className="flex gap-1">
                                <button onClick={() => saveEdit(row.id)} className="p-1 rounded bg-green-100 text-green-700 hover:bg-green-200"><Check className="h-3 w-3" /></button>
                                <button onClick={() => setEditingRow(null)} className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"><X className="h-3 w-3" /></button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <button onClick={() => { setEditingRow(row.id); setEditData({ ...row }); }}
                                  className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"><Edit2 className="h-3 w-3" /></button>
                                {!PROTECTED.includes(activeTable) && (
                                  <button onClick={() => deleteRow(row.id)}
                                    className="p-1 rounded bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="h-3 w-3" /></button>
                                )}
                              </div>
                            )}
                          </td>
                          {columns.map(col => (
                            <td key={col} className="px-3 py-1.5 max-w-xs">
                              {editingRow === row.id && !['id','createdAt','updatedAt'].includes(col) ? (
                                <input value={editData[col] ?? ''} onChange={e => setEditData(p => ({ ...p, [col]: e.target.value }))}
                                  className="w-full border border-blue-300 rounded px-1.5 py-0.5 text-xs outline-none focus:border-blue-500 min-w-16" />
                              ) : (
                                <span className={`${row[col] === null ? 'text-slate-300' : 'text-slate-700'} whitespace-nowrap`}>
                                  {row[col] === null ? 'NULL' :
                                    typeof row[col] === 'object' ? JSON.stringify(row[col]).substring(0, 60) :
                                    String(row[col]).length > 60 ? String(row[col]).substring(0, 60) + '…' :
                                    String(row[col])}
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 flex-col gap-3 text-slate-400">
              <Database className="h-12 w-12 opacity-30" />
              <p className="text-sm">Select a table from the sidebar</p>
              <p className="text-xs">or use SQL Query to run custom queries</p>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>

      {/* Add Record Modal */}
    {showAddModal && activeTable && (
      <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.5)" }}>
        <div style={{ background:"white",borderRadius:"12px",padding:"1.5rem",width:"100%",maxWidth:"32rem",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 25px 50px rgba(0,0,0,0.3)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-800">Add Record — {TABLE_LABELS[activeTable] || activeTable}</h2>
            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
          </div>
          <div className="space-y-2">
            {columns.filter(col => !['id','createdAt','updatedAt'].includes(col)).map(col => (
              <div key={col}>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">{col}</label>
                <input value={addData[col] || ""} onChange={e => setAddData(p => ({ ...p, [col]: e.target.value }))}
                  placeholder={col} className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-blue-400" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowAddModal(false)} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={addRecord} disabled={addLoading} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">
              {addLoading ? "Saving..." : "Save Record"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Bulk Import Modal */}
    {showImportModal && activeTable && (
      <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.5)" }}>
        <div style={{ background:"white",borderRadius:"12px",padding:"1.5rem",width:"100%",maxWidth:"36rem",boxShadow:"0 25px 50px rgba(0,0,0,0.3)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-800">Bulk Import — {TABLE_LABELS[activeTable] || activeTable}</h2>
            <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
          </div>
          <p className="text-xs text-slate-500 mb-2">Paste a JSON array of records. Required fields only — id, createdAt, updatedAt are auto-generated.</p>
          <p className="text-xs text-blue-600 mb-2 font-mono bg-blue-50 p-2 rounded">Example: {`[{"name":"Test","email":"test@example.com"}]`}</p>
          <textarea value={importJson} onChange={e => setImportJson(e.target.value)}
            placeholder={`[{"field1":"value1","field2":"value2"}]`}
            className="w-full h-40 border border-slate-200 rounded-md p-2.5 text-xs font-mono outline-none focus:border-blue-400 resize-none bg-slate-900 text-green-400" />
          {importResult && (
            <p className={`text-xs mt-2 font-semibold p-2 rounded ${importResult.includes('Failed: 0') ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
              {importResult}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowImportModal(false)} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Close</button>
            <button onClick={bulkImport} disabled={importLoading} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {importLoading ? "Importing..." : "Import Records"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

