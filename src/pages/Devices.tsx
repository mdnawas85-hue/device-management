import React, { useEffect, useRef, useState } from 'react';
import {
  Monitor, Plus, Search, Pencil, Trash2, Loader2, RefreshCw,
  CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
  Cpu, MemoryStick, HardDrive, Activity, Download,
  UploadCloud, DownloadCloud, FileText, X, Clock, CheckCheck, FolderOpen,
} from 'lucide-react';
import type { Device, FileTransfer, FileUploadRequest } from '../types';

const STATUS_COLORS: Record<string, string> = {
  Online:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Offline:     'bg-red-500/15 text-red-400 border-red-500/20',
  Maintenance: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  Retired:     'bg-slate-500/15 text-slate-400 border-slate-500/20',
};

const EMPTY: Device = {
  id: '', device_name: '', device_type: 'Laptop', brand: '', model: '',
  serial_number: '', mac_address: '', ip_address: '', os: 'Windows',
  os_version: '', status: 'Online', assigned_to: '', department: '',
  location: '', purchase_date: '', warranty_end: '', notes: '',
  created_at: '', updated_at: '',
};

const TYPES    = ['Laptop','Desktop','Phone','Tablet','Server','Printer','Network','Other'];
const OS_LIST  = ['Windows','macOS','Linux','Android','iOS','Other'];
const STATUSES = ['Online','Offline','Maintenance','Retired'];

function fmtBytes(b: number) {
  if (b >= 1e12) return (b / 1e12).toFixed(1) + ' TB';
  if (b >= 1e9)  return (b / 1e9).toFixed(1) + ' GB';
  if (b >= 1e6)  return (b / 1e6).toFixed(0) + ' MB';
  return b + ' B';
}
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtAge(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function UsageBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}
function isAgentOnline(d: Device) {
  if (!d.last_seen) return false;
  return Date.now() - new Date(d.last_seen).getTime() < 30 * 60 * 1000;
}

// ── Edit / Add Modal ─────────────────────────────────────────────────────────
interface ModalProps { device: Device | null; onClose: () => void; onSaved: (d: Device) => void; }
const Modal: React.FC<ModalProps> = ({ device, onClose, onSaved }) => {
  const [form,   setForm]   = useState<Device>(device ?? { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const isEdit = !!device?.id;
  const set = (k: keyof Device, v: string) => setForm(f => ({ ...f, [k]: v || null }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.device_name.trim()) return setError('Device name is required');
    setSaving(true); setError('');
    try {
      const res  = await fetch('/api/devices', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSaved(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const F = (label: string, key: keyof Device, type = 'text', req = false) => (
    <div key={String(key)}>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}{req && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} value={(form[key] as string) ?? ''} onChange={e => set(key, e.target.value)} required={req}
        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 transition" />
    </div>
  );
  const S = (label: string, key: keyof Device, opts: string[]) => (
    <div key={String(key)}>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      <select value={(form[key] as string) ?? ''} onChange={e => set(key, e.target.value)}
        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 transition">
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-base font-bold text-white">{isEdit ? 'Edit Device' : 'Add New Device'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {F('Device Name','device_name','text',true)}
            {S('Device Type','device_type',TYPES)}
            {F('Brand','brand')} {F('Model','model')}
            {F('Serial Number','serial_number')} {F('MAC Address','mac_address')}
            {F('IP Address','ip_address')} {S('OS','os',OS_LIST)}
            {F('OS Version','os_version')} {S('Status','status',STATUSES)}
            {F('Assigned To','assigned_to')} {F('Department','department')}
            {F('Location','location')} {F('Purchase Date','purchase_date','date')}
            {F('Warranty End','warranty_end','date')}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> {isEdit ? 'Save Changes' : 'Add Device'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── File Transfer Modal ───────────────────────────────────────────────────────
interface TransferModalProps { device: Device; onClose: () => void; }
const FileTransferModal: React.FC<TransferModalProps> = ({ device, onClose }) => {
  const fileRef   = useRef<HTMLInputElement>(null);
  const [file,        setFile]        = useState<File | null>(null);
  const [sending,     setSending]     = useState(false);
  const [uploadPct,   setUploadPct]   = useState(0);
  const [success,     setSuccess]     = useState('');
  const [error,       setError]       = useState('');
  const [transfers,   setTransfers]   = useState<FileTransfer[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadTransfers = async () => {
    try {
      const res  = await fetch(`/api/transfers?device_id=${device.id}`);
      const data = await res.json();
      setTransfers(Array.isArray(data) ? data : []);
    } catch { /* silently ignore */ }
    finally { setLoadingList(false); }
  };

  useEffect(() => {
    loadTransfers();
    // Auto-refresh every 10 s while modal is open so Pending → Delivered updates live
    const interval = setInterval(loadTransfers, 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setSuccess('');
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0] ?? null;
    setFile(f);
    setSuccess('');
    setError('');
  };

  const handleSend = async () => {
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      setError('File too large. Maximum size is 4.5 MB.');
      return;
    }
    setSending(true);
    setUploadPct(0);
    setError('');
    setSuccess('');
    try {
      // Read file as base64 data URL
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target!.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Use XHR so we get real upload progress events
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/transfers');
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadPct(100);
            resolve();
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).error ?? 'Upload failed')); }
            catch { reject(new Error('Upload failed')); }
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(JSON.stringify({ device_id: device.id, filename: file.name, data }));
      });

      setSuccess(`"${file.name}" queued — the agent will download it on next heartbeat (within 5 min).`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      loadTransfers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch('/api/transfers', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    setTransfers(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <UploadCloud className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Send File</h2>
              <p className="text-xs text-slate-400">{device.device_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition
              ${file ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/30'}`}
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <input ref={fileRef} type="file" className="hidden" onChange={handleFilePick} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-indigo-400 shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-white truncate max-w-xs">{file.name}</p>
                  <p className="text-xs text-slate-400">{fmtBytes(file.size)}</p>
                </div>
              </div>
            ) : (
              <>
                <UploadCloud className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-sm text-slate-300 font-medium">Drop file here or click to browse</p>
                <p className="text-xs text-slate-500 mt-1">Maximum 4.5 MB · Saved to <span className="font-mono">C:\ProgramData\DeviceManager\Transfers\</span></p>
              </>
            )}
          </div>

          {/* Feedback */}
          {error   && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2.5 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          {success && <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg px-3 py-2.5 text-sm"><CheckCheck className="w-4 h-4 shrink-0" />{success}</div>}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!file || sending}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2.5 rounded-xl text-sm transition"
          >
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
              : <><UploadCloud className="w-4 h-4" /> Send File to Device</>}
          </button>

          {/* Upload progress bar */}
          {sending && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                  Uploading {file?.name}
                </span>
                <span className="font-semibold text-indigo-300">{uploadPct}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
              {file && (
                <p className="text-xs text-slate-500 text-right">
                  {fmtBytes(Math.round(file.size * uploadPct / 100))} / {fmtBytes(file.size)}
                </p>
              )}
            </div>
          )}

          {/* Transfer history */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Transfer History</h3>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                live
              </span>
            </div>
            {loadingList ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : transfers.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No transfers yet</p>
            ) : (
              <div className="space-y-1.5">
                {transfers.map(t => (
                  <div key={t.id} className="flex items-center gap-3 bg-slate-700/40 rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{t.filename}</p>
                      <p className="text-xs text-slate-500">{fmtBytes(t.size)} · {fmtAge(t.created_at)}</p>
                    </div>
                    {t.status === 'delivered' ? (
                      <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        <CheckCheck className="w-3 h-3" /> Delivered
                      </span>
                    ) : (
                      <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    )}
                    {t.status === 'pending' && (
                      <button onClick={() => handleDelete(t.id)}
                        className="shrink-0 p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── File Collect Modal (device → dashboard) ───────────────────────────────────
interface CollectModalProps { device: Device; onClose: () => void; }
const FileCollectModal: React.FC<CollectModalProps> = ({ device, onClose }) => {
  const [filePath,    setFilePath]    = useState('');
  const [requesting,  setRequesting]  = useState(false);
  const [success,     setSuccess]     = useState('');
  const [error,       setError]       = useState('');
  const [requests,    setRequests]    = useState<FileUploadRequest[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const PRESETS = [
    { label: '📁 Desktop',   path: '%USERPROFILE%\\Desktop',   isDir: true  },
    { label: '📁 Documents', path: '%USERPROFILE%\\Documents', isDir: true  },
    { label: '📁 Downloads', path: '%USERPROFILE%\\Downloads', isDir: true  },
    { label: '📄 hosts',     path: 'C:\\Windows\\System32\\drivers\\etc\\hosts', isDir: false },
  ];

  const loadRequests = async () => {
    try {
      const res  = await fetch(`/api/uploads?device_id=${device.id}`);
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch { /* silently ignore */ }
    finally { setLoadingList(false); }
  };

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleRequest = async () => {
    const path = filePath.trim();
    if (!path) return;
    setRequesting(true); setError(''); setSuccess('');
    try {
      const res  = await fetch('/api/uploads', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ device_id: device.id, file_path: path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setSuccess(`Request queued — agent will upload the file on next heartbeat (within 5 min).`);
      setFilePath('');
      loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setRequesting(false);
    }
  };

  const handleDownload = async (req: FileUploadRequest) => {
    const res  = await fetch(`/api/uploads?id=${req.id}&action=download`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = req.filename ?? 'file';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    await fetch('/api/uploads', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    setRequests(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
              <DownloadCloud className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Collect File from Device</h2>
              <p className="text-xs text-slate-400">{device.device_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* File path input */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              File path on the device
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500 transition">
                <FolderOpen className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  value={filePath}
                  onChange={e => { setFilePath(e.target.value); setError(''); setSuccess(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleRequest()}
                  placeholder="C:\Users\user\Desktop\report.pdf"
                  className="bg-transparent text-sm text-white placeholder-slate-500 outline-none flex-1 font-mono"
                />
              </div>
              <button
                onClick={handleRequest}
                disabled={!filePath.trim() || requesting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold transition"
              >
                {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
                {requesting ? 'Queuing…' : 'Request'}
              </button>
            </div>
          </div>

          {/* Quick path presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-slate-500">Quick paths</p>
              <p className="text-xs text-slate-600">📁 folders return a file listing</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setFilePath(p.path)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hint */}
          <p className="text-xs text-slate-600 leading-relaxed">
            Enter a <span className="text-slate-400">full file path</span> to collect a specific file, or a <span className="text-slate-400">folder path</span> to get a directory listing.
            Env vars like <span className="font-mono text-slate-400">%USERPROFILE%</span> and <span className="font-mono text-slate-400">%PROGRAMDATA%</span> are supported.
          </p>

          {/* Feedback */}
          {error   && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2.5 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          {success && <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg px-3 py-2.5 text-sm"><CheckCheck className="w-4 h-4 shrink-0" />{success}</div>}

          {/* Request history */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Collected Files</h3>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                live
              </span>
            </div>
            {loadingList ? (
              <div className="flex items-center justify-center gap-2 text-slate-500 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : requests.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No requests yet</p>
            ) : (
              <div className="space-y-1.5">
                {requests.map(r => (
                  <div key={r.id} className="flex items-center gap-3 bg-slate-700/40 rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate font-mono">{r.filename ?? r.file_path.split('\\').pop()}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {r.file_path}
                        {r.size ? ` · ${fmtBytes(r.size)}` : ''}
                        {' · '}{fmtAge(r.created_at)}
                      </p>
                      {r.error && <p className="text-xs text-red-400 mt-0.5">{r.error}</p>}
                    </div>

                    {/* Status badge */}
                    {r.status === 'ready' ? (
                      <button
                        onClick={() => handleDownload(r)}
                        className="shrink-0 flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full hover:bg-emerald-500/20 transition"
                      >
                        <Download className="w-3 h-3" /> Download
                      </button>
                    ) : r.status === 'error' ? (
                      <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                        <AlertCircle className="w-3 h-3" /> Error
                      </span>
                    ) : (
                      <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    )}

                    <button
                      onClick={() => handleDelete(r.id)}
                      className="shrink-0 p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Agent Hardware expand row ─────────────────────────────────────────────────
const HardwareRow: React.FC<{ d: Device }> = ({ d }) => {
  const hw = d.hardware;
  if (!hw) return null;
  const cpuPct  = hw.cpu_usage ?? 0;
  const ramPct  = hw.ram_total ? (hw.ram_used ?? 0) / hw.ram_total * 100 : 0;
  const diskPct = hw.disk_total ? (hw.disk_used ?? 0) / hw.disk_total * 100 : 0;
  const seenAgo = d.last_seen
    ? Math.round((Date.now() - new Date(d.last_seen).getTime()) / 60000) : null;

  return (
    <tr className="bg-slate-900/60 border-b border-slate-700">
      <td colSpan={9} className="px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 text-xs">
          {/* CPU */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><Cpu className="w-3.5 h-3.5" /><span className="font-semibold">CPU</span></div>
            <p className="text-white font-medium truncate">{hw.cpu_brand ?? '—'}</p>
            <p className="text-slate-400">{hw.cpu_cores ?? '?'} cores · {hw.cpu_threads ?? '?'} threads</p>
            <div className="mt-2">
              <div className="flex justify-between text-slate-400 mb-1"><span>Usage</span><span className={cpuPct>80?'text-red-400':cpuPct>50?'text-amber-400':'text-slate-300'}>{cpuPct.toFixed(1)}%</span></div>
              <UsageBar pct={cpuPct} color={cpuPct>80?'bg-red-500':cpuPct>50?'bg-amber-500':'bg-blue-500'} />
            </div>
          </div>
          {/* RAM */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><MemoryStick className="w-3.5 h-3.5" /><span className="font-semibold">Memory</span></div>
            <p className="text-white font-medium">{fmtBytes(hw.ram_total ?? 0)} total</p>
            <p className="text-slate-400">{fmtBytes(hw.ram_used ?? 0)} used</p>
            <div className="mt-2">
              <div className="flex justify-between text-slate-400 mb-1"><span>Usage</span><span className={ramPct>85?'text-red-400':ramPct>60?'text-amber-400':'text-slate-300'}>{ramPct.toFixed(1)}%</span></div>
              <UsageBar pct={ramPct} color={ramPct>85?'bg-red-500':ramPct>60?'bg-amber-500':'bg-emerald-500'} />
            </div>
          </div>
          {/* Disk */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><HardDrive className="w-3.5 h-3.5" /><span className="font-semibold">Storage</span></div>
            <p className="text-white font-medium">{fmtBytes(hw.disk_total ?? 0)} total</p>
            <p className="text-slate-400">{fmtBytes(hw.disk_used ?? 0)} used · {fmtBytes(hw.disk_free ?? 0)} free</p>
            <div className="mt-2">
              <div className="flex justify-between text-slate-400 mb-1"><span>Usage</span><span className={diskPct>85?'text-red-400':diskPct>70?'text-amber-400':'text-slate-300'}>{diskPct.toFixed(1)}%</span></div>
              <UsageBar pct={diskPct} color={diskPct>85?'bg-red-500':diskPct>70?'bg-amber-500':'bg-purple-500'} />
            </div>
          </div>
          {/* Network */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><Activity className="w-3.5 h-3.5" /><span className="font-semibold">Network</span></div>
            {(hw.ip_addresses ?? []).filter(ip => !ip.includes(':')).map((ip, i) => (
              <p key={i} className="text-white font-mono">{ip}</p>
            ))}
            {(hw.ip_addresses ?? []).filter(ip => ip.includes(':')).map((ip, i) => (
              <p key={`v6-${i}`} className="text-slate-500 font-mono text-xs truncate">{ip}</p>
            ))}
            {hw.mac_address && <p className="text-slate-400 font-mono mt-1">{hw.mac_address}</p>}
          </div>
          {/* System */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><Monitor className="w-3.5 h-3.5" /><span className="font-semibold">System</span></div>
            <p className="text-white">{hw.os ?? '—'} {hw.os_version}</p>
            <p className="text-slate-400">Arch: {hw.kernel_arch ?? '—'}</p>
            {hw.serial_number && <p className="text-slate-400">S/N: <span className="font-mono">{hw.serial_number}</span></p>}
            {hw.uptime && <p className="text-slate-400">Up: {fmtUptime(hw.uptime)}</p>}
            {hw.logged_user && <p className="text-slate-400">User: {hw.logged_user}</p>}
            {seenAgo !== null && <p className="text-slate-500 mt-1">Last seen: {seenAgo < 1 ? 'just now' : `${seenAgo}m ago`}</p>}
          </div>
        </div>
      </td>
    </tr>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
export const Devices: React.FC = () => {
  const [devices,      setDevices]      = useState<Device[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modal,        setModal]        = useState<Device | null | 'new'>(null);
  const [transferDev,  setTransferDev]  = useState<Device | null>(null);
  const [collectDev,   setCollectDev]   = useState<Device | null>(null);
  const [delConf,      setDelConf]      = useState<string | null>(null);
  const [delId,        setDelId]        = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
  const [error,        setError]        = useState('');
  const [refreshing,   setRefreshing]   = useState(false);

  const load = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const res  = await fetch('/api/devices');
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load devices'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleSaved = (d: Device) => {
    setDevices(prev => {
      const idx = prev.findIndex(x => x.id === d.id);
      return idx >= 0 ? prev.map(x => x.id === d.id ? d : x) : [d, ...prev];
    });
    setModal(null);
  };

  const handleDelete = async (id: string) => {
    if (delConf !== id) { setDelConf(id); return; }
    setDelId(id); setDelConf(null);
    try {
      await fetch('/api/devices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      setDevices(prev => prev.filter(d => d.id !== id));
    } catch { setError('Delete failed'); }
    finally { setDelId(null); }
  };

  const filtered = devices.filter(d => {
    const q = search.toLowerCase();
    return (
      (!q || d.device_name.toLowerCase().includes(q) ||
        (d.assigned_to ?? '').toLowerCase().includes(q) ||
        (d.ip_address ?? '').toLowerCase().includes(q) ||
        (d.serial_number ?? '').toLowerCase().includes(q)) &&
      (typeFilter   === 'All' || d.device_type === typeFilter) &&
      (statusFilter === 'All' || d.status === statusFilter)
    );
  });

  const types = ['All', ...Array.from(new Set(devices.map(d => d.device_type)))];

  const downloadAgent = () => {
    const a = document.createElement('a');
    a.href = '/DeviceManager-Setup.exe';
    a.download = 'DeviceManager-Setup.exe';
    a.click();
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Devices</h1>
            <p className="text-sm text-slate-400">{devices.length} total · {devices.filter(d => !!d.agent_token).length} agent-linked</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadAgent}
            className="flex items-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold px-3 py-2 rounded-lg transition">
            <Download className="w-3.5 h-3.5" /> Download Agent
          </button>
          <button onClick={() => load(true)} disabled={refreshing}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setModal('new')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            <Plus className="w-4 h-4" /> Add Device
          </button>
        </div>
      </div>

      {/* Agent install banner */}
      {!loading && devices.filter(d => !!d.agent_token).length === 0 && (
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-indigo-300">Install the agent to get live hardware data</p>
            <p className="text-xs text-slate-400 mt-0.5">Run <span className="font-mono bg-slate-700 px-1.5 py-0.5 rounded">DeviceManager-Setup.exe</span> on any Windows machine — it auto-registers and reports every 5 minutes.</p>
          </div>
          <button onClick={downloadAgent}
            className="shrink-0 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            <Download className="w-4 h-4" /> Download .exe
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex-1 min-w-48">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, IP, serial…"
            className="bg-transparent text-sm text-white placeholder-slate-500 outline-none flex-1" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:ring-2 focus:ring-blue-500">
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:ring-2 focus:ring-blue-500">
          {['All', ...STATUSES].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Loading devices…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20"><Monitor className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">{search ? 'No devices match your search.' : 'No devices yet.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700">
                <tr className="text-xs text-slate-400 font-medium">
                  <th className="w-8 px-2 py-3" />
                  {['Device','Type','OS','Serial No.','Status','Agent','IP Address','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const hasAgent  = !!d.agent_token;
                  const agentLive = hasAgent && isAgentOnline(d);
                  const isExpanded = expanded.has(d.id);

                  return (
                    <React.Fragment key={d.id}>
                      <tr className={`hover:bg-slate-700/30 border-b border-slate-700/50 transition ${isExpanded ? 'bg-slate-700/20' : ''}`}>
                        <td className="px-2 py-3 text-center">
                          {hasAgent && (
                            <button onClick={() => toggleExpand(d.id)} className="text-slate-500 hover:text-slate-300 transition">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{d.device_name}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{d.device_type}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{d.os ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">
                          {d.serial_number ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[d.status] ?? STATUS_COLORS.Offline}`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {hasAgent ? (
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                              agentLive
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                                : 'bg-slate-500/15 text-slate-400 border-slate-500/20'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${agentLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                              {agentLive ? 'Live' : 'Installed'}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">{d.ip_address ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {/* Send file → device */}
                            {hasAgent && (
                              <button onClick={() => setTransferDev(d)}
                                title="Send file to device"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition">
                                <UploadCloud className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Collect file ← device */}
                            {hasAgent && (
                              <button onClick={() => setCollectDev(d)}
                                title="Collect file from device"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition">
                                <DownloadCloud className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => setModal(d)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition"><Pencil className="w-3.5 h-3.5" /></button>
                            {delConf === d.id ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleDelete(d.id)} className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-semibold">Yes</button>
                                <button onClick={() => setDelConf(null)} className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300">No</button>
                              </div>
                            ) : delId === d.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                            ) : (
                              <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && d.hardware && <HardwareRow d={d} />}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal && modal !== 'new' && <Modal device={modal} onClose={() => setModal(null)} onSaved={handleSaved} />}
      {modal === 'new'           && <Modal device={null}  onClose={() => setModal(null)} onSaved={handleSaved} />}
      {transferDev               && <FileTransferModal device={transferDev} onClose={() => setTransferDev(null)} />}
      {collectDev                && <FileCollectModal  device={collectDev}  onClose={() => setCollectDev(null)} />}
    </div>
  );
};
