import React from 'react';
import { TabType } from '../types';
import { motion } from 'motion/react';
import { LayoutDashboard, Crosshair, FolderTree, Network, Sparkles, Eye, CheckCircle2 } from 'lucide-react';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  mobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  mobileMenuOpen,
  onCloseMobileMenu
}) => {
  const handleNavClick = (tab: TabType) => {
    onTabChange(tab);
    if (onCloseMobileMenu) onCloseMobileMenu();
  };

  const navItems = [
    {
      id: 'overview' as TabType,
      label: 'Overview',
      badge: '#summary',
      badgeType: 'text',
      icon: LayoutDashboard,
      iconColor: 'text-indigo-400',
    },
    {
      id: 'impact' as TabType,
      label: 'Impact Sight',
      badge: 'CORE',
      badgeType: 'pill',
      badgeColor: 'bg-rose-950/60 text-rose-300 border-rose-800/80',
      icon: Crosshair,
      iconColor: 'text-rose-400',
    },
    {
      id: 'files' as TabType,
      label: 'Files Browser',
      badge: '247',
      badgeType: 'text',
      icon: FolderTree,
      iconColor: 'text-indigo-400',
    },
    {
      id: 'chakra' as TabType,
      label: 'Chakra Network',
      badge: 'Graph',
      badgeType: 'text',
      icon: Network,
      iconColor: 'text-cyan-400',
    },
    {
      id: 'techniques' as TabType,
      label: 'Techniques',
      badge: 'Patterns',
      badgeType: 'text',
      icon: Sparkles,
      iconColor: 'text-amber-400',
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden"
          onClick={onCloseMobileMenu}
        />
      )}

      <aside 
        className={`fixed top-0 left-0 bottom-0 w-64 bg-[#080d1a] border-r border-slate-800/80 p-4 flex flex-col justify-between z-50 transition-transform duration-300 md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col">
          {/* Brand Header */}
          <div className="flex items-center gap-3 px-1 pt-1 pb-4 border-b border-slate-800/60">
            <div className="w-11 h-11 rounded-2xl bg-[#0b1022] border border-indigo-500/40 shadow-[0_0_16px_rgba(99,102,241,0.25)] flex items-center justify-center shrink-0">
              <div className="w-5 h-5 rounded-full border border-indigo-400/60 flex items-center justify-center shadow-[0_0_6px_rgba(129,140,248,0.4)]">
                <div className="w-2 h-2 rounded-full bg-indigo-300 shadow-[0_0_4px_#a5b4fc]" />
              </div>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[16px] text-white tracking-tight leading-none">Byakugan</span>
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-500/30 leading-none">
                  v2.4
                </span>
              </div>
              <span className="text-[11px] text-slate-400 tracking-tight font-normal mt-1">
                Codebase Telemetry &amp; AST
              </span>
            </div>
          </div>

          {/* Workspace Navigation */}
          <div className="mt-5">
            <div className="font-mono text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2.5">
              WORKSPACE
            </div>
            <nav className="space-y-1.5 font-sans relative">
              {navItems.map(item => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-colors text-left group ${
                      isActive ? 'text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Soft animated background pill */}
                    {isActive && (
                      <motion.div
                        layoutId="activeWorkspacePill"
                        className="absolute inset-0 bg-[#151d3b] rounded-xl border border-[#2e3c66] shadow-[0_0_14px_rgba(45,62,126,0.35)]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}

                    <div className="relative z-10 flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 transition-colors ${isActive ? (item.iconColor || 'text-indigo-400') : 'text-slate-400 group-hover:text-slate-200'}`} />
                      <span>{item.label}</span>
                    </div>

                    <div className="relative z-10">
                      {item.badgeType === 'pill' ? (
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border leading-tight ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-slate-400 group-hover:text-slate-300">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Telemetry & Status */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          <div className="p-2.5 rounded-xl bg-[#0b1428] border border-slate-800/80 flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
              </span>
              <span className="text-xs text-slate-200 font-medium">AST Engine Sync</span>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-400">99.8%</span>
          </div>
          
          <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-mono">
            <span>Branch: <span className="text-white font-semibold">main</span></span>
            <span className="text-slate-500 text-[11px]">#c87a2d</span>
          </div>
        </div>
      </aside>
    </>
  );
};
