import React, { useState } from 'react';
import { ArchitecturePattern, SkillLevel, TabType } from '../types';
import { PATTERNS_DATA } from '../data/mockData';
import { 
  Sparkles, 
  Search, 
  Database, 
  Cable, 
  KeyRound, 
  Power, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  Code2, 
  ChevronDown, 
  ChevronUp, 
  FilterX, 
  RotateCcw,
  Zap,
  ArrowRight
} from 'lucide-react';

interface TechniquesViewProps {
  skillLevel: SkillLevel;
  onNavigateTab: (tab: TabType) => void;
  onSelectInspectFile?: (filename: string) => void;
}

export const TechniquesView: React.FC<TechniquesViewProps> = ({
  skillLevel,
  onNavigateTab,
  onSelectInspectFile
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedSnippets, setExpandedSnippets] = useState<Record<string, boolean>>({
    'repo-pattern': false,
    'di-pattern': false,
    'idempotency-pattern': false,
    'circuit-breaker-pattern': false,
  });

  const toggleSnippet = (id: string) => {
    setExpandedSnippets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredPatterns = PATTERNS_DATA.filter(pattern => {
    const matchesCat = selectedCategory === "all" || pattern.category === selectedCategory;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      pattern.name.toLowerCase().includes(query) ||
      pattern.plainDefinition.toLowerCase().includes(query) ||
      pattern.whyItMatters.toLowerCase().includes(query) ||
      pattern.categoryLabel.toLowerCase().includes(query) ||
      pattern.occurrences.some(o => o.file.toLowerCase().includes(query));
    return matchesCat && matchesSearch;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'structural': return <Database className="w-5 h-5 text-indigo-400" />;
      case 'creational': return <Cable className="w-5 h-5 text-cyan-400" />;
      case 'concurrency': return <KeyRound className="w-5 h-5 text-amber-400" />;
      case 'behavioral': return <Power className="w-5 h-5 text-purple-400" />;
      default: return <Sparkles className="w-5 h-5 text-indigo-400" />;
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* Header Banner */}
      <div className="relative rounded-2xl bg-gradient-to-r from-[#0d1527] via-[#131b2e] to-[#0d1527] p-6 md:p-8 border border-slate-800 shadow-xl overflow-hidden">
        <div className="absolute -top-32 -left-20 w-96 h-96 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
        <div className="absolute top-20 right-10 w-80 h-80 rounded-full bg-cyan-600/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-semibold">
              <Layers className="w-4 h-4" />
              <span>STATIC AST SCAN • SYNTAX MATRIX v3.4</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Detected Software Architecture &amp; Design Patterns
            </h1>
            <p className="text-sm text-slate-300 font-sans leading-relaxed">
              Automated static analysis detected {PATTERNS_DATA.length} patterns implemented across 34 files in <span className="font-mono text-cyan-300">payments-backend</span>.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-[#060e20] p-3 rounded-2xl border border-slate-800 shrink-0 font-mono">
            <div className="flex flex-col px-3">
              <span className="text-[10px] text-slate-400 uppercase">Pattern Health</span>
              <span className="text-xl font-bold text-emerald-400">98.2%</span>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div className="flex flex-col px-3">
              <span className="text-[10px] text-slate-400 uppercase">Coverage</span>
              <span className="text-xl font-bold text-white">34 / 41 Files</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0d1527] p-3 rounded-2xl border border-slate-800 shadow-md">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 font-mono text-xs">
          {[
            { id: 'all', label: 'All Patterns', count: PATTERNS_DATA.length },
            { id: 'behavioral', label: 'Behavioral', count: 3 },
            { id: 'creational', label: 'Creational', count: 1 },
            { id: 'structural', label: 'Structural', count: 1 },
            { id: 'concurrency', label: 'Concurrency', count: 1 },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0 ${
                selectedCategory === tab.id
                  ? 'bg-indigo-600 text-white font-semibold shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-[#171f33]'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded ${selectedCategory === tab.id ? 'bg-indigo-800 text-white' : 'bg-[#171f33] text-slate-400'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter by symbol, file or keyword..."
            className="w-full pl-9 pr-10 py-1.5 rounded-xl bg-[#060e20] text-slate-100 placeholder:text-slate-400 font-mono text-xs border border-slate-700/80 focus:outline-none focus:border-indigo-500 transition-all"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate-500 bg-[#171f33] px-1.5 py-0.5 rounded border border-slate-700">/</span>
        </div>
      </div>

      {/* Patterns Grid */}
      {filteredPatterns.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center glass-card rounded-2xl border border-slate-800 p-8">
          <div className="w-14 h-14 rounded-full bg-[#171f33] flex items-center justify-center text-slate-400 mb-3 border border-slate-700">
            <FilterX className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white">No Architectural Patterns Matched</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm font-sans">
            No patterns match the selected criteria. Try resetting the category filter or searching with different AST tokens.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("all");
              setSearchQuery("");
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear All Filters</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {filteredPatterns.map(pattern => {
            const isExpanded = expandedSnippets[pattern.id];
            return (
              <div
                key={pattern.id}
                className="glass-card group rounded-2xl p-6 border border-slate-800 flex flex-col justify-between shadow-md hover:border-slate-700 transition-all bg-[#0d1527]/80 space-y-4"
              >
                <div className="space-y-4">
                  {/* Top Bar: Category, Score, Name, Icon */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md font-mono text-[10px] bg-[#171f33] text-cyan-300 border border-slate-700 font-semibold">
                          {pattern.categoryLabel}
                        </span>
                        <span className="px-2 py-0.5 rounded-md font-mono text-[10px] bg-[#171f33] text-slate-400 border border-slate-800">
                          {pattern.astScore}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                        {pattern.name}
                      </h2>
                    </div>

                    <div className="w-10 h-10 rounded-xl bg-[#171f33] border border-slate-700/80 flex items-center justify-center shrink-0">
                      {getCategoryIcon(pattern.category)}
                    </div>
                  </div>

                  {/* Occurrences Chips */}
                  <div className="bg-[#060e20] p-3 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase">
                      <span>Detected Occurrences</span>
                      <span className="text-emerald-400 font-semibold">{pattern.occurrences.length} Files Active</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                      {pattern.occurrences.map(occ => (
                        <button
                          key={`${occ.file}:${occ.line}`}
                          type="button"
                          onClick={() => {
                            if (onSelectInspectFile) onSelectInspectFile(occ.file);
                            onNavigateTab('files');
                          }}
                          className="px-2 py-0.5 rounded bg-[#171f33] text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 border border-slate-800 transition-colors text-left truncate max-w-[280px]"
                        >
                          {occ.file.replace('src/', '')}:{occ.line}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Plain Definition */}
                  <div className="bg-[#131b2e] p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="font-mono text-[10px] font-semibold text-cyan-400 uppercase tracking-wider block">
                      Plain Definition
                    </span>
                    <p className="text-xs text-slate-200 font-sans leading-relaxed">
                      {pattern.plainDefinition}
                    </p>
                  </div>

                  {/* Why It Matters & Without It Risk */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-500/20 space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-bold font-mono text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Why It Matters</span>
                      </div>
                      <p className="text-slate-300 font-sans text-[11px] leading-relaxed">
                        {pattern.whyItMatters}
                      </p>
                    </div>

                    <div className="bg-rose-950/20 p-3 rounded-xl border border-rose-500/20 space-y-1">
                      <div className="flex items-center gap-1.5 text-rose-400 font-bold font-mono text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Without It Risk</span>
                      </div>
                      <p className="text-slate-300 font-sans text-[11px] leading-relaxed">
                        {pattern.withoutItRisk}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Collapsible Implementation Code Snippet */}
                <div className="pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => toggleSnippet(pattern.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#171f33] text-slate-200 hover:text-white hover:bg-[#222a3d] font-mono text-xs transition-colors border border-slate-800"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Code2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="truncate">{pattern.codeSnippetTitle}</span>
                    </span>
                    <div className="flex items-center gap-1 text-slate-400 shrink-0">
                      <span className="text-[10px]">{isExpanded ? 'Hide Implementation' : 'View Implementation'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 rounded-xl overflow-hidden bg-[#060e20] p-3 border border-slate-800 font-mono text-xs">
                      <div className="text-[10px] text-slate-500 mb-1.5">// {pattern.codeSnippetFile}</div>
                      <pre className="text-slate-300 overflow-x-auto leading-relaxed">
                        <code>{pattern.codeSnippet}</code>
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
