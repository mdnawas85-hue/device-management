import React, { useEffect, useState } from 'react';
import {
  Monitor, Plus, Search, Pencil, Trash2, Loader2, RefreshCw,
  CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
  Cpu, MemoryStick, HardDrive, Activity, Download,
} from 'lucide-react';
import type { Device } from '../types';

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
function UsageBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}
function isAgentOnline(d: Device) {
  if (!d.last_seen) return false;
  return Date.now() - new Date(d.last_seen).getTime() < 10 * 60 * 1000;
}

// ── Edit / Add Modal ─────────────────────────────────────────────────────────
interface ModalProps { device: Device | null; onClose: () => void; onSaved: (d: Device) => void; }
const Modal: React.FC<ModalProps> = ({ device, onClose, onSaved }) => {
  const [form, setForm]   = useState<Device>(device ?? { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
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
            {(hw.ip_addresses ?? []).map((ip, i) => <p key={i} className="text-white font-mono">{ip}</p>)}
            {hw.mac_address && <p className="text-slate-400 font-mono mt-1">{hw.mac_address}</p>}
          </div>
          {/* System */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><Monitor className="w-3.5 h-3.5" /><span className="font-semibold">System</span></div>
            <p className="text-white">{hw.os ?? '—'} {hw.os_version}</p>
            <p className="text-slate-400">Arch: {hw.kernel_arch ?? '—'}</p>
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

  // Download agent
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

      {/* Agent install banner (shown when no agents linked) */}
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search devices…"
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
                  {['Device','Type','OS','Status','Agent','Assigned To','IP Address','Actions'].map(h => (
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
                        {/* Expand toggle */}
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
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{d.assigned_to ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">{d.ip_address ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
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
                      {/* Agent hardware expand row */}
                      {isExpanded && d.hardware && <HardwareRow d={d} />}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && modal !== 'new' && <Modal device={modal}  onClose={() => setModal(null)} onSaved={handleSaved} />}
      {modal === 'new'            && <Modal device={null}  onClose={() => setModal(null)} onSaved={handleSaved} />}
    </div>
  );
};
