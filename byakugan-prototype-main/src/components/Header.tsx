import React from 'react';
import { SkillLevel } from '../types';
import { Box, GitFork, BrainCircuit, Share2, Moon, Sun, Menu, User } from 'lucide-react';

interface HeaderProps {
  skillLevel: SkillLevel;
  onSkillLevelChange: (level: SkillLevel) => void;
  onOpenShareModal: () => void;
  onToggleMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  skillLevel,
  onSkillLevelChange,
  onOpenShareModal,
  onToggleMobileMenu,
}) => {
  return (
    <header className="h-16 bg-[#060e20]/90 backdrop-blur-md border-b border-slate-800/80 z-40 flex items-center justify-between px-4 sm:px-6 sticky top-0 shrink-0">
      {/* Left: Mobile Toggle & Repo info with Tech Stack */}
      <div className="flex items-center gap-3 overflow-hidden">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60"
          aria-label="Toggle mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Repo Name */}
        <div className="flex items-center gap-2 bg-[#131b2e] border border-slate-700/80 px-3 py-1 rounded-lg shrink-0">
          <Box className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-white text-xs sm:text-sm tracking-wide">
            payments-backend
          </span>
        </div>

        {/* Branch */}
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#222a3d] border border-slate-700/70 text-slate-200 shrink-0 text-xs font-mono">
          <GitFork className="w-3.5 h-3.5 text-cyan-400" />
          <span>main</span>
        </div>

        {/* Tech Stack Badges */}
        <div className="hidden xl:flex items-center gap-1.5 overflow-x-auto py-1 text-[11px] font-mono">
          <span className="px-2 py-0.5 rounded bg-[#171f33] text-cyan-300 border border-slate-700/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            Node.js
          </span>
          <span className="px-2 py-0.5 rounded bg-[#171f33] text-cyan-300 border border-slate-700/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            Express
          </span>
          <span className="px-2 py-0.5 rounded bg-[#171f33] text-cyan-300 border border-slate-700/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            TypeScript
          </span>
          <span className="px-2 py-0.5 rounded bg-[#171f33] text-cyan-300 border border-slate-700/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            PostgreSQL
          </span>
          <span className="px-2 py-0.5 rounded bg-[#171f33] text-cyan-300 border border-slate-700/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            Redis
          </span>
        </div>
      </div>

      {/* Right: Depth Selector, Theme Toggle, Share CTA, Avatar */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Skill / Depth Mode Selector */}
        <div className="flex items-center gap-1 bg-[#131b2e] border border-slate-700/80 rounded-xl p-0.5 sm:p-1 shadow-inner">
          <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-2 pr-1">
            <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
            <span>Depth</span>
          </span>
          <div className="inline-flex rounded-lg bg-[#0b1326] p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => onSkillLevelChange('beginner')}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all text-[11px] sm:text-xs ${
                skillLevel === 'beginner'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Beginner
            </button>
            <button
              type="button"
              onClick={() => onSkillLevelChange('intermediate')}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all text-[11px] sm:text-xs ${
                skillLevel === 'intermediate'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Intermediate
            </button>
            <button
              type="button"
              onClick={() => onSkillLevelChange('senior')}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all text-[11px] sm:text-xs ${
                skillLevel === 'senior'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Senior
            </button>
          </div>
        </div>

        {/* Theme Toggle Icon (Simulated / Clean) */}
        <button
          type="button"
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#171f33] text-slate-300 hover:text-white hover:bg-[#222a3d] border border-slate-700/60 transition-colors"
          title="Toggle Theme Mode"
        >
          <Moon className="w-4 h-4" />
        </button>

        {/* Share Report CTA */}
        <button
          type="button"
          onClick={onOpenShareModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Share Report</span>
        </button>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-400 p-[1px] flex items-center justify-center shadow-md">
          <div className="w-full h-full bg-[#0b1326] rounded-full flex items-center justify-center text-indigo-300">
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>
    </header>
  );
};
