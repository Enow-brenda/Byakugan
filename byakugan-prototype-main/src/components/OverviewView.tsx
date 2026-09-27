import React from 'react';
import { SkillLevel, TabType } from '../types';
import { SKILL_TEXTS } from '../data/mockData';
import { 
  ShieldCheck, 
  Files, 
  Boxes, 
  GitMerge, 
  Sparkles, 
  Cpu, 
  FileCode, 
  CheckCircle2, 
  Share2, 
  ShieldAlert, 
  ArrowRight,
  Crosshair,
  Network
} from 'lucide-react';

interface OverviewViewProps {
  skillLevel: SkillLevel;
  onNavigateTab: (tab: TabType) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ skillLevel, onNavigateTab }) => {
  const currentSkillData = SKILL_TEXTS[skillLevel];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Hero Card with Plain-Language Summary & Architecture Health Gauge */}
      <div className="glass-card rounded-2xl p-6 md:p-8 relative overflow-hidden border border-slate-800 shadow-xl bg-gradient-to-br from-[#0d1527]/90 via-[#0d1527]/80 to-[#171f33]/40">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3.5 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>AST Syntax Scan Complete • Production Grade</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-snug">
              High-throughput transactional microservice powering multi-gateway card settlement and atomic ledger transfers.
            </h1>

            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              Byakugan analyzes AST dependencies, mutation side effects, and cyclic references across{' '}
              <span className="text-indigo-400 font-mono font-medium">payments-backend</span>. Plan Mode assists team members in estimating change impact before committing pull requests.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigateTab('impact')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 transition-all hover:scale-[1.02]"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Inspect Blast Radius</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('chakra')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#171f33] hover:bg-[#222a3d] text-cyan-300 border border-cyan-500/30 transition-all"
              >
                <Network className="w-3.5 h-3.5 text-cyan-400" />
                <span>Open Chakra Graph (22 Nodes)</span>
              </button>
            </div>
          </div>

          {/* Health Score Gauge */}
          <div className="bg-[#0b1428]/95 border border-slate-700/80 rounded-2xl p-6 flex flex-col items-center justify-center min-w-[210px] shadow-2xl shrink-0">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.2"
                />
                <path
                  className="text-indigo-500 drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray="98.4, 100"
                  strokeLinecap="round"
                  strokeWidth="3.2"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-xl font-bold font-mono text-white tracking-tight">98.4%</span>
              </div>
            </div>
            <div className="mt-3 text-center">
              <span className="text-xs font-semibold text-slate-200 block">Architecture Health</span>
              <p className="text-[11px] text-emerald-400 font-medium mt-0.5">Optimal DAG Structure</p>
            </div>
          </div>
        </div>
      </div>

      {/* Repo Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Files */}
        <div 
          onClick={() => onNavigateTab('files')}
          className="glass-card rounded-xl p-5 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-indigo-500/50 transition-all hover:translate-y-[-2px]"
        >
          <div>
            <p className="text-xs font-medium text-slate-400">Total Files</p>
            <h3 className="text-3xl font-extrabold text-white font-mono mt-1">247</h3>
            <p className="text-[11px] text-indigo-400 mt-1.5 flex items-center gap-1 font-mono">
              <FileCode className="w-3.5 h-3.5" /> 34.2k LOC
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Files className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Active Modules */}
        <div 
          onClick={() => onNavigateTab('chakra')}
          className="glass-card rounded-xl p-5 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-emerald-500/50 transition-all hover:translate-y-[-2px]"
        >
          <div>
            <p className="text-xs font-medium text-slate-400">Active Modules</p>
            <h3 className="text-3xl font-extrabold text-white font-mono mt-1">12</h3>
            <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" /> 0 Circular Loops
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Dependencies */}
        <div 
          onClick={() => onNavigateTab('chakra')}
          className="glass-card rounded-xl p-5 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-cyan-500/50 transition-all hover:translate-y-[-2px]"
        >
          <div>
            <p className="text-xs font-medium text-slate-400">Dependencies</p>
            <h3 className="text-3xl font-extrabold text-white font-mono mt-1">47</h3>
            <p className="text-[11px] text-cyan-400 mt-1.5 flex items-center gap-1 font-mono">
              <GitMerge className="w-3.5 h-3.5" /> 112 AST Edges
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Share2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Design Patterns */}
        <div 
          onClick={() => onNavigateTab('techniques')}
          className="glass-card rounded-xl p-5 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-amber-500/50 transition-all hover:translate-y-[-2px]"
        >
          <div>
            <p className="text-xs font-medium text-slate-400">Design Patterns</p>
            <h3 className="text-3xl font-extrabold text-white font-mono mt-1">9</h3>
            <p className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1 font-mono">
              <ShieldAlert className="w-3.5 h-3.5" /> 2 Fragile Patterns
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Active Skill-Level Adaptive Card */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 bg-gradient-to-r from-[#0d1527] via-[#0d1527] to-indigo-950/20 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <Cpu className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-white tracking-wide">Adaptive Explanation Lens</h2>
            <span className="px-2.5 py-0.5 text-xs rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold font-mono">
              {currentSkillData.badgeLong}
            </span>
          </div>
          <span className="text-xs text-slate-400 font-mono">Toggled via top header</span>
        </div>

        <div className="bg-[#060e20]/80 rounded-xl p-5 border border-slate-800 text-sm text-slate-300 leading-relaxed font-mono transition-all shadow-inner">
          {currentSkillData.overviewCard}
        </div>
      </div>
    </div>
  );
};
