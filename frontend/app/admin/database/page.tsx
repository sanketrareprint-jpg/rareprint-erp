"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Loader2, Database, Search, Trash2, Edit2, Check, X, Play, ChevronLeft, ChevronRight, Upload, Download } from "lucide-react";

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
  const [columns, setColumns] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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
  // Bulk import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState("");
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const LIMIT = 50;

  useEffect(() => {
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
      setColumns(d.columns || (d.rows?.[0] ? Object.keys(d.rows[0]) : []));
      setTotal(d.total || 0);
      setTotalPages(Math.ceil((d.total || 0) / LIMIT) || 1);
    } finally { setTableLoading(false); }
  }, []);

  const saveEdit = async (id: string) => {
    if (!activeTable) return;
    const res = await fetch(`${API_BASE_URL}/admin/db/table/${activeTable}/${id}`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(editData),
    });
    if (res.ok) { setEditingRow(null); loadTable(activeTable, page); }
    else { const e = await res.json(); alert("Save failed: " + (e.message || "Unknown error")); }
  };

  const deleteRow = async (id: string) => {
    if (!activeTable || !confirm("Delete this record?")) return;
    const res = await fetch(`${API_BASE_URL}/admin/db/table/${activeTable}/${id}`, {
      method: "DELETE", headers: getAuthHeaders(),
    });
    if (res.ok) loadTable(activeTable, page);
    else alert("Delete failed");
  };

  const addRecord = async () => {
    if (!activeTable) return;
    setAddLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/db/table/${activeTable}`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(addData),
      });
      if (res.ok) { setShowAddModal(false); setAddData({}); loadTable(activeTable, page); }
      else { const e = await res.json(); alert("Add failed: " + (e.message || JSON.stringify(e))); }
    } finally { setAddLoading(false); }
  };

  const runSql = async () => {
    if (!sql.trim()) return;
    setSqlLoading(true); setSqlResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/db/query`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const d = await res.json();
      setSqlResult(d);
    } catch (e) { setSqlResult({ error: String(e) }); }
    finally { setSqlLoading(false); }
  };

  // ── CSV Bulk Import ──────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportCsvText((ev.target?.result as string) || "");
      setImportResult(null);
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const downloadSampleCsv = () => {
    if (!activeTable || columns.length === 0) { alert("Open a table first"); return; }
    const sampleCols = columns.filter(c => !["id", "createdAt", "updatedAt"].includes(c));
    const csv = sampleCols.join(",") + "\n" + sampleCols.map(() => "example_value").join(",");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${activeTable}_sample.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const STRING_FIELDS = [
    "phone","email","name","fullName","address","city","state","pincode","role","status",
    "sku","description","sizeInches","sides","printingType","openSizeInches","passwordHash",
    "notes","slug","type","category","unit","uom","businessName","contactName","gstNumber",
    "panNumber","ifscCode","accountNumber","bankName","accountType","orderNumber",
  ];

  const bulkImport = async () => {
    if (!activeTable || !importCsvText.trim()) { alert("Please choose a CSV file first"); return; }
    setImportLoading(true); setImportResult(null);
    try {
      const lines = importCsvText.trim().split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { alert("CSV must have a header row and at least one data row"); setImportLoading(false); return; }
      const headers = lines[0].split(",").map((h: string) => h.trim());
      const dataRows = lines.slice(1).filter((l: string) => l.trim());
      let success = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const vals = dataRows[i].split(",").map((v: string) => v.trim());
        const obj: Record<string, any> = {};
        headers.forEach((h: string, j: number) => {
          let v: any = vals[j] ?? "";
          if (v === "" || v === "NULL" || v === "null") { v = null; }
          else if (v === "true" || v === "TRUE") { v = true; }
          else if (v === "false" || v === "FALSE") { v = false; }
          else if (!STRING_FIELDS.includes(h) && !isNaN(Number(v)) && v !== "") { v = Number(v); }
          obj[h] = v;
        });
        // Strip relation objects and auto fields
        const clean: Record<string, any> = {};
        const SKIP_KEYS = ["id","createdAt","updatedAt","category","productCategory",
          "customer","order","vendor","user","product","items","payments","costSlabs",
          "commissionRule","paymentAccount","jobWork","printSheet","shipment",
          "invoice","commission","productionJob","tags"];
        Object.entries(obj).forEach(([k, val]) => {
          if (SKIP_KEYS.includes(k)) return;
          if (val !== null && typeof val === "object") return;
          clean[k] = val;
        });
        try {
          const res = await fetch(`${API_BASE_URL}/admin/db/table/${activeTable}`, {
            method: "POST",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(clean),
          });
          if (res.ok) { success++; }
          else {
            const e = await res.json();
            errors.push(`Row ${i + 2}: ${e.message || JSON.stringify(e)}`);
          }
        } catch (err) { errors.push(`Row ${i + 2}: Network error`); }
      }

      const msg = `✅ Imported: ${success} / ${dataRows.length}  |  ❌ Failed: ${errors.length}` +
        (errors.length > 0 ? `\n\nErrors:\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? `\n...and ${errors.length - 5} more` : ""}` : "");
      setImportResult(msg);
      if (success > 0) {
        loadTable(activeTable, 1);
        // Refresh sidebar counts
        fetch(`${API_BASE_URL}/admin/db/tables`, { headers: getAuthHeaders() })
          .then(r => r.json())
          .then(d => { setTables(d.tables || []); setCounts(d.counts || {}); });
      }
    } catch (e) { setImportResult("Import failed: " + String(e)); }
    finally { setImportLoading(false); }
  };

  const filteredRows = rows.filter(row =>
    !search || Object.values(row).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return (
    <DashboardShell>
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    </DashboardShell>
  );

  return (
    <>
    <DashboardShell>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r border-slate-200 bg-white flex flex-col overflow-hidden shrink-0">
          <div className="p-3 border-b border-slate-100">
            <div className="flex gap-1">
              <button onClick={() => setActiveTab("tables")}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${activeTab === "tables" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                Tables
              </button>
              <button onClick={() => setActiveTab("query")}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${activeTab === "query" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                SQL Query
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {tables.map(t => (
              <button key={t} onClick={() => loadTable(t, 1)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${activeTable === t ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>
                <span className="truncate">{TABLE_LABELS[t] || t}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTable === t ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                  {counts[t] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {activeTab === "query" ? (
            <div className="flex flex-col flex-1 p-4 gap-3">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Play className="h-4 w-4" />SQL Query</h2>
              <textarea value={sql} onChange={e => setSql(e.target.value)}
                placeholder="SELECT * FROM products LIMIT 10;"
                className="w-full h-32 border border-slate-200 rounded-lg p-3 text-xs font-mono outline-none focus:border-blue-400 resize-none" />
              <button onClick={runSql} disabled={sqlLoading}
                className="self-start inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-60">
                {sqlLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Run Query
              </button>
              {sqlResult && (
                <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
                  {sqlResult.error ? (
                    <p className="p-3 text-xs text-red-600 font-mono">{sqlResult.error}</p>
                  ) : Array.isArray(sqlResult.rows) ? (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                        <tr>{sqlResult.columns?.map((c: string) => <th key={c} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{c}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sqlResult.rows.map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {sqlResult.columns?.map((c: string) => (
                              <td key={c} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                                {row[c] === null ? <span className="text-slate-300">NULL</span> : String(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <pre className="p-3 text-xs text-slate-700 font-mono">{JSON.stringify(sqlResult, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          ) : activeTable ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Table toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-white shrink-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">{TABLE_LABELS[activeTable] || activeTable}</h2>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{total} records</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setAddData({}); setShowAddModal(true); }}
                    className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">
                    + Add Record
                  </button>
                  <button onClick={() => { setImportCsvText(""); setImportFileName(null); setImportResult(null); setShowImportModal(true); }}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700">
                    <Upload className="h-3 w-3" /> Bulk Import
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

    {/* Bulk Import Modal — CSV File Picker */}
    {showImportModal && activeTable && (
      <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.5)" }}>
        <div style={{ background:"white",borderRadius:"12px",padding:"1.5rem",width:"100%",maxWidth:"36rem",boxShadow:"0 25px 50px rgba(0,0,0,0.3)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-800">Bulk Import — {TABLE_LABELS[activeTable] || activeTable}</h2>
            <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
          </div>

          {/* Step 1: Download Sample */}
          <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-700 mb-1">Step 1 — Download sample CSV</p>
            <p className="text-xs text-slate-500 mb-2">Get the correct column headers for this table pre-filled.</p>
            <button onClick={downloadSampleCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium">
              <Download className="h-3 w-3" /> Download Sample CSV
            </button>
          </div>

          {/* Step 2: Choose CSV File */}
          <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-700 mb-1">Step 2 — Choose your CSV file</p>
            <p className="text-xs text-slate-500 mb-2">Select a .csv file from your computer to import.</p>
            <label className="inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium">
              <Upload className="h-3 w-3" /> Choose CSV File
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            </label>
            {importFileName && (
              <span className="ml-2 text-xs text-green-700 font-medium">
                ✅ {importFileName} — {importCsvText.trim().split(/\r?\n/).length - 1} data rows ready
              </span>
            )}
          </div>

          {/* Step 3: Import */}
          <div className="mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-700 mb-1">Step 3 — Import records</p>
            <p className="text-xs text-slate-500">
              Fields <span className="font-mono bg-slate-200 px-1 rounded">id</span>, <span className="font-mono bg-slate-200 px-1 rounded">createdAt</span>, <span className="font-mono bg-slate-200 px-1 rounded">updatedAt</span> are auto-generated and should not be in your CSV.
            </p>
          </div>

          {/* Result message */}
          {importResult && (
            <div className={`text-xs mb-3 p-2.5 rounded-lg whitespace-pre-wrap font-mono leading-5 ${importResult.includes("❌ Failed: 0") ? "bg-green-50 text-green-800 border border-green-200" : "bg-orange-50 text-orange-800 border border-orange-200"}`}>
              {importResult}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowImportModal(false); setImportCsvText(""); setImportFileName(null); setImportResult(null); }}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
              Close
            </button>
            <button onClick={bulkImport} disabled={importLoading || !importCsvText.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
              {importLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Importing...</> : <><Upload className="h-3 w-3" /> Import Records</>}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}



