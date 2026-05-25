import React, { useEffect, useState } from 'react';
import { Layers, RefreshCw, Monitor } from 'lucide-react';
import type { Device } from '../types';

const GROUPS     = ['Head Office', 'Cake Factory', 'Meat Factory', 'Sulaywarehouse', 'Restaurant'];
const SUB_GROUPS = ['Center Region', 'Western Region', 'Northern Region', 'Eastern Region'];

function isAgentOnline(d: Device) {
  if (!d.last_seen) return false;
  return Date.now() - new Date(d.last_seen).getTime() < 30 * 60 * 1000;
}

const STATUS_STYLE: Record<string, string> = {
  Online:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Offline:     'bg-red-500/15 text-red-400 border-red-500/20',
  Maintenance: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  Retired:     'bg-slate-500/15 text-slate-400 border-slate-500/20',
};

export const Groups: React.FC = () => {
  const [devices,    setDevices]    = useState<Device[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected,   setSelected]   = useState<string | null>(null);
  const [subFilter,  setSubFilter]  = useState('All');

  const load = (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    fetch('/api/devices')
      .then(r => r.json())
      .then(d => setDevices(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { load(); }, []);

  const groupStats = GROUPS.map(g => {
    const devs = devices.filter(d => d.group === g);
    return { name: g, count: devs.length, online: devs.filter(d => d.status === 'Online').length };
  });

  const selectedDevices = selected ? devices.filter(d => d.group === selected) : [];
  const filteredDevices = subFilter === 'All'
    ? selectedDevices
    : selectedDevices.filter(d => d.sub_group === subFilter);

  const unassigned = devices.filter(d => !d.group).length;

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel — group list ── */}
      <aside className="w-60 shrink-0 border-r border-slate-700/60 flex flex-col bg-slate-900/30">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">Device Groups</span>
          </div>
          <button onClick={() => load(true)}
            className="p-1 rounded text-slate-500 hover:text-slate-300 transition">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-11 bg-slate-800/60 rounded-lg animate-pulse mx-1 mb-1" />
            ))
          ) : (
            GROUPS.map(g => {
              const stat  = groupStats.find(s => s.name === g)!;
              const active = selected === g;
              return (
                <button key={g}
                  onClick={() => { setSelected(g); setSubFilter('All'); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition border
                    ${active
                      ? 'bg-blue-600/20 border-blue-500/30 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition
                    ${active ? 'bg-blue-500/20' : 'bg-slate-700/70'}`}>
                    <Layers className={`w-3.5 h-3.5 ${active ? 'text-blue-400' : 'text-slate-500'}`} />
                  </div>
                  <span className="flex-1 text-sm font-medium truncate">{g}</span>
                  <span className={`shrink-0 min-w-[22px] text-center text-xs font-bold px-1.5 py-0.5 rounded-full transition
                    ${stat.count > 0
                      ? active ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'
                      : 'bg-slate-800/80 text-slate-600'
                    }`}>
                    {stat.count}
                  </span>
                </button>
              );
            })
          )}
        </nav>

        {!loading && unassigned > 0 && (
          <div className="px-5 py-3 border-t border-slate-700/60">
            <p className="text-xs text-slate-600">{unassigned} device{unassigned !== 1 ? 's' : ''} unassigned</p>
          </div>
        )}
      </aside>

      {/* ── Right panel ── */}
      <main className="flex-1 overflow-y-auto">

        {/* No group selected — overview cards */}
        {!selected && (
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Layers className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Device Groups</h1>
                <p className="text-sm text-slate-400">Select a group to view its devices</p>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-32 bg-slate-800 border border-slate-700 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupStats.map(s => (
                  <button key={s.name}
                    onClick={() => setSelected(s.name)}
                    className="bg-slate-800 border border-slate-700 hover:border-blue-500/40 hover:bg-slate-700/50 rounded-xl p-5 text-left transition">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <Layers className="w-5 h-5 text-blue-400" />
                      </div>
                      <span className={`text-3xl font-bold ${s.count > 0 ? 'text-white' : 'text-slate-600'}`}>
                        {s.count}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-200">{s.name}</p>
                    {s.online > 0 && (
                      <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {s.online} online
                      </p>
                    )}
                    {s.count === 0 && (
                      <p className="text-xs text-slate-600 mt-1.5">No devices assigned</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Group selected — device list */}
        {selected && (() => {
          const stat = groupStats.find(s => s.name === selected)!;
          return (
            <div className="p-6 space-y-5">

              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">{selected}</h1>
                  <p className="text-sm text-slate-400">
                    {stat.count} device{stat.count !== 1 ? 's' : ''}
                    {stat.online > 0 && (
                      <span className="ml-2 text-emerald-400">· {stat.online} online</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Sub-group filter chips */}
              <div className="flex flex-wrap gap-2">
                {['All', ...SUB_GROUPS].map(sg => {
                  const count  = sg === 'All'
                    ? selectedDevices.length
                    : selectedDevices.filter(d => d.sub_group === sg).length;
                  const active = subFilter === sg;
                  return (
                    <button key={sg}
                      onClick={() => setSubFilter(sg)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition
                        ${active
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                    >
                      {sg}
                      <span className={`rounded-full text-[10px] font-bold px-1.5 py-0.5
                        ${active ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Devices table */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {filteredDevices.length === 0 ? (
                  <div className="text-center py-16">
                    <Monitor className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      No devices in {subFilter === 'All' ? selected : `${subFilter}`}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      Assign devices to this group via the Devices page → Edit
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-700">
                        <tr className="text-xs text-slate-400 font-medium">
                          {['Device', 'Type', 'Region', 'Status', 'Agent', 'IP Address'].map(h => (
                            <th key={h} className="text-left px-4 py-3">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDevices.map(d => {
                          const hasAgent  = !!d.agent_token;
                          const agentLive = hasAgent && isAgentOnline(d);
                          return (
                            <tr key={d.id}
                              className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Monitor className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  <span className="font-medium text-white">{d.device_name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-300">{d.device_type}</td>
                              <td className="px-4 py-3">
                                {d.sub_group
                                  ? <span className="text-xs bg-slate-700 text-slate-300 border border-slate-600 px-2 py-0.5 rounded-full">
                                      {d.sub_group}
                                    </span>
                                  : <span className="text-slate-600 text-xs">—</span>
                                }
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border
                                  ${STATUS_STYLE[d.status] ?? STATUS_STYLE.Offline}`}>
                                  {d.status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {hasAgent ? (
                                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border
                                    ${agentLive
                                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                                      : 'bg-slate-500/15 text-slate-400 border-slate-500/20'
                                    }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full
                                      ${agentLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                                    {agentLive ? 'Live' : 'Installed'}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-600">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                                {d.ip_address ?? '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
};
