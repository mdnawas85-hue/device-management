import React, { useEffect, useState } from 'react';
import { Monitor, Plus, Search, Pencil, Trash2, Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
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

const TYPES   = ['Laptop','Desktop','Phone','Tablet','Server','Printer','Network','Other'];
const OS_LIST = ['Windows','macOS','Linux','Android','iOS','Other'];
const STATUSES= ['Online','Offline','Maintenance','Retired'];

interface ModalProps {
  device: Device | null;
  onClose: () => void;
  onSaved: (d: Device) => void;
}
const Modal: React.FC<ModalProps> = ({ device, onClose, onSaved }) => {
  const [form, setForm] = useState<Device>(device ?? { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!device?.id;

  const set = (k: keyof Device, v: string) => setForm(f => ({ ...f, [k]: v || null }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.device_name.trim()) return setError('Device name is required');
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/devices', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSaved(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof Device, type = 'text', required = false) => (
    <div key={key}>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input
        type={type}
        value={(form[key] as string) ?? ''}
        onChange={e => set(key, e.target.value)}
        required={required}
        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 transition"
      />
    </div>
  );

  const select = (label: string, key: keyof Device, opts: string[]) => (
    <div key={key}>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      <select
        value={(form[key] as string) ?? ''}
        onChange={e => set(key, e.target.value)}
        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 transition"
      >
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-base font-bold text-white">{isEdit ? 'Edit Device' : 'Add New Device'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none transition">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Device Name', 'device_name', 'text', true)}
            {select('Device Type', 'device_type', TYPES)}
            {field('Brand', 'brand')}
            {field('Model', 'model')}
            {field('Serial Number', 'serial_number')}
            {field('MAC Address', 'mac_address')}
            {field('IP Address', 'ip_address')}
            {select('Operating System', 'os', OS_LIST)}
            {field('OS Version', 'os_version')}
            {select('Status', 'status', STATUSES)}
            {field('Assigned To', 'assigned_to')}
            {field('Department', 'department')}
            {field('Location', 'location')}
            {field('Purchase Date', 'purchase_date', 'date')}
            {field('Warranty End', 'warranty_end', 'date')}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
            <textarea
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
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

export const Devices: React.FC = () => {
  const [devices,  setDevices]  = useState<Device[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modal,    setModal]    = useState<Device | null | 'new'>(null);
  const [delId,    setDelId]    = useState<string | null>(null);
  const [delConf,  setDelConf]  = useState<string | null>(null);
  const [error,    setError]    = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load devices'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

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
    const matchSearch = !q || d.device_name.toLowerCase().includes(q) || (d.assigned_to ?? '').toLowerCase().includes(q) || (d.serial_number ?? '').toLowerCase().includes(q) || (d.ip_address ?? '').toLowerCase().includes(q);
    const matchType   = typeFilter   === 'All' || d.device_type === typeFilter;
    const matchStatus = statusFilter === 'All' || d.status       === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const types = ['All', ...Array.from(new Set(devices.map(d => d.device_type)))];

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
            <p className="text-sm text-slate-400">{devices.length} total devices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} disabled={refreshing} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setModal('new')} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            <Plus className="w-4 h-4" /> Add Device
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex-1 min-w-48">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search devices…" className="bg-transparent text-sm text-white placeholder-slate-500 outline-none flex-1" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:ring-2 focus:ring-blue-500">
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:ring-2 focus:ring-blue-500">
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
          <div className="text-center py-20"><Monitor className="w-10 h-10 text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">{search ? 'No devices match your search.' : 'No devices yet. Click "Add Device" to get started.'}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700">
                <tr className="text-xs text-slate-400 font-medium">
                  {['Device Name','Type','Brand / Model','OS','Status','Assigned To','Department','IP Address','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filtered.map(d => (
                  <tr key={d.id} className="hover:bg-slate-700/30 transition">
                    <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{d.device_name}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{d.device_type}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{[d.brand, d.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{d.os ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[d.status] ?? STATUS_COLORS.Offline}`}>{d.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{d.assigned_to ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{d.department ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">{d.ip_address ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setModal(d)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition"><Pencil className="w-3.5 h-3.5" /></button>
                        {delConf === d.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(d.id)} className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-semibold transition">Yes</button>
                            <button onClick={() => setDelConf(null)} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition">No</button>
                          </div>
                        ) : delId === d.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        ) : (
                          <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal && modal !== 'new' && <Modal device={modal}  onClose={() => setModal(null)} onSaved={handleSaved} />}
      {modal === 'new'            && <Modal device={null}  onClose={() => setModal(null)} onSaved={handleSaved} />}
    </div>
  );
};
