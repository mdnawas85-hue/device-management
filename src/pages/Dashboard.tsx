import React, { useEffect, useState } from 'react';
import { Monitor, Wifi, WifiOff, Wrench, LayoutDashboard } from 'lucide-react';
import type { Device } from '../types';

export const Dashboard: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/devices')
      .then(r => r.json())
      .then((d: Device[]) => { setDevices(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const total       = devices.length;
  const online      = devices.filter(d => d.status === 'Online').length;
  const offline     = devices.filter(d => d.status === 'Offline').length;
  const maintenance = devices.filter(d => d.status === 'Maintenance').length;

  const kpis = [
    { label: 'Total Devices',   value: total,       icon: Monitor, color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
    { label: 'Online',          value: online,      icon: Wifi,    color: 'text-emerald-400', bg: 'bg-emerald-500/10',border: 'border-emerald-500/20' },
    { label: 'Offline',         value: offline,     icon: WifiOff, color: 'text-red-400',     bg: 'bg-red-500/10',    border: 'border-red-500/20' },
    { label: 'Maintenance',     value: maintenance, icon: Wrench,  color: 'text-amber-400',   bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  ];

  // Device type breakdown
  const byType = devices.reduce<Record<string, number>>((acc, d) => {
    acc[d.device_type] = (acc[d.device_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <LayoutDashboard className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400">Overview of all managed devices</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl border ${k.border} ${k.bg} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400">{k.label}</span>
              <k.icon className={`w-4 h-4 ${k.color}`} />
            </div>
            {loading
              ? <div className="h-8 w-12 bg-slate-700 rounded animate-pulse" />
              : <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>}
          </div>
        ))}
      </div>

      {/* Device type breakdown */}
      {!loading && Object.keys(byType).length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Devices by Type</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type} className="bg-slate-700/50 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-slate-300">{type}</span>
                <span className="text-sm font-bold text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && total === 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
          <Monitor className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No devices yet. Add your first device on the Devices page.</p>
        </div>
      )}
    </div>
  );
};
