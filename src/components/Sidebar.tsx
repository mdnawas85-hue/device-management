import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Monitor, Layers, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

const NAV = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices', icon: Monitor,         label: 'Devices'   },
  { to: '/groups',  icon: Layers,          label: 'Groups'    },
];

export const Sidebar: React.FC = () => (
  <aside className="w-56 min-h-screen bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
    {/* Logo */}
    <div className="px-5 py-5 border-b border-slate-800">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <Monitor className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="text-white font-bold text-base leading-none">Device</span>
          <p className="text-slate-500 text-xs mt-0.5">Manager</p>
        </div>
      </div>
    </div>

    {/* Nav */}
    <nav className="flex-1 px-3 py-4 space-y-1">
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-blue-600/15 text-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`
          }
        >
          <Icon size={17} className="shrink-0" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>

    {/* Sign out */}
    <div className="px-4 pb-5">
      <button
        onClick={() => supabase.auth.signOut()}
        className="flex items-center gap-2 w-full text-slate-400 hover:text-red-400 hover:bg-slate-800 px-3 py-2.5 rounded-lg text-sm font-medium transition"
      >
        <LogOut size={17} className="shrink-0" />
        <span>Sign Out</span>
      </button>
    </div>
  </aside>
);
