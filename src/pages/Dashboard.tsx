import React, { useEffect, useState } from 'react';
import { Monitor, Wifi, WifiOff, Wrench, LayoutDashboard, Cpu, MemoryStick, HardDrive, Activity, AlertTriangle } from 'lucide-react';
import type { Device } from '../types';

function fmtBytes(b: number) {
  if (b >= 1e12) return (b / 1e12).toFixed(1) + ' TB';
  if (b >= 1e9)  return (b / 1e9).toFixed(1) + ' GB';
  if (b >= 1e6)  return (b / 1e6).toFixed(0) + ' MB';
  return b + ' B';
}

function UsageBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function isOnlineByAgent(d: Device): boolean {
  if (!d.last_seen) return false;
  return Date.now() - new Date(d.last_seen).getTime() < 30 * 60 * 1000; // 30 min
}

function AgentCard({ d }: { d: Device }) {
  const hw = d.hardware;
  if (!hw) return null;
  const cpuPct  = hw.cpu_usage ?? 0;
  const ramPct  = hw.ram_total ? (hw.ram_used ?? 0) / hw.ram_total * 100 : 0;
  const diskPct = hw.disk_total ? (hw.disk_used ?? 0) / hw.disk_total * 100 : 0;
  const online  = isOnlineByAgent(d);
  const seenAgo = d.last_seen
    ? Math.round((Date.now() - new Date(d.last_seen).getTime()) / 60000)
    : null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-sm font-semibold text-white truncate">{d.device_name}</span>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
          online
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
            : 'bg-red-500/15 text-red-400 border-red-500/20'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      <p className="text-xs text-slate-500 mb-3">{hw.os ?? d.os ?? '—'} · {hw.cpu_brand?.split(' ').slice(0,3).join(' ') ?? '—'}</p>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</span>
            <span>{cpuPct.toFixed(1)}%</span>
          </div>
          <UsageBar pct={cpuPct} color={cpuPct > 80 ? 'bg-red-500' : cpuPct > 50 ? 'bg-amber-500' : 'bg-blue-500'} />
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1"><MemoryStick className="w-3 h-3" /> RAM</span>
            <span>{fmtBytes(hw.ram_used ?? 0)} / {fmtBytes(hw.ram_total ?? 0)}</span>
          </div>
          <UsageBar pct={ramPct} color={ramPct > 85 ? 'bg-red-500' : ramPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'} />
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> Disk</span>
            <span>{fmtBytes(hw.disk_used ?? 0)} / {fmtBytes(hw.disk_total ?? 0)}</span>
          </div>
          <UsageBar pct={diskPct} color={diskPct > 85 ? 'bg-red-500' : diskPct > 70 ? 'bg-amber-500' : 'bg-purple-500'} />
        </div>
      </div>

      {seenAgo !== null && (
        <p className="text-xs text-slate-600 mt-3">Last seen {seenAgo < 1 ? 'just now' : `${seenAgo}m ago`}</p>
      )}
    </div>
  );
}

export const Dashboard: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch('/api/devices')
        .then(r => r.json())
        .then((d: Device[]) => { setDevices(Array.isArray(d) ? d : []); setLoading(false); })
        .catch(() => setLoading(false));
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const total       = devices.length;
  const agentOnline = devices.filter(d => isOnlineByAgent(d)).length;
  const agentLinked = devices.filter(d => !!d.agent_token).length;
  const offline     = devices.filter(d => d.status === 'Offline' || (!isOnlineByAgent(d) && d.agent_token)).length;
  const maintenance = devices.filter(d => d.status === 'Maintenance').length;

  const kpis = [
    { label: 'Total Devices',   value: total,       icon: Monitor,   color: 'text-blue-400',   bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
    { label: 'Agent Online',    value: agentOnline, icon: Wifi,      color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { label: 'Agent Linked',    value: agentLinked, icon: Activity,  color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
    { label: 'Offline',         value: offline,     icon: WifiOff,   color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
    { label: 'Maintenance',     value: maintenance, icon: Wrench,    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  ];

  const agentDevices  = devices.filter(d => !!d.agent_token && !!d.hardware);
  // Devices that have an agent but haven't checked in for > 30 min
  const offlineAgents = devices.filter(d => !!d.agent_token && !isOnlineByAgent(d));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
            <p className="text-sm text-slate-400">Live device telemetry · refreshes every 30s</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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

      {/* Offline agent alert */}
      {offlineAgents.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-300">
                {offlineAgents.length === 1
                  ? `${offlineAgents[0].device_name} agent is not reporting`
                  : `${offlineAgents.length} agents are not reporting`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Last seen:{' '}
                {offlineAgents.map((d, i) => {
                  const mins = d.last_seen
                    ? Math.round((Date.now() - new Date(d.last_seen).getTime()) / 60000)
                    : null;
                  const ago = mins === null ? 'never' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
                  return (
                    <span key={d.id}>
                      {i > 0 && ', '}
                      <span className="text-white font-medium">{d.device_name}</span> ({ago})
                    </span>
                  );
                })}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                To restart: on the device open{' '}
                <span className="font-mono text-slate-300">C:\ProgramData\DeviceManager\DeviceManagerAgent.exe</span>
                {' '}or re-run the installer.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Agent live cards */}
      {agentDevices.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-300">Live Agent Telemetry</h2>
            <span className="text-xs bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 rounded-full px-2 py-0.5">{agentDevices.length} devices</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {agentDevices.map(d => <AgentCard key={d.id} d={d} />)}
          </div>
        </div>
      )}

      {/* Device type breakdown */}
      {!loading && total > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Devices by Type</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(
              devices.reduce<Record<string, number>>((a, d) => ({ ...a, [d.device_type]: (a[d.device_type] ?? 0) + 1 }), {})
            ).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
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
          <p className="text-slate-300 font-medium mb-1">No devices yet</p>
          <p className="text-slate-500 text-sm">Install the agent on a Windows machine or add devices manually.</p>
        </div>
      )}
    </div>
  );
};
