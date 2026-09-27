import React, { useState } from 'react';
import { SkillLevel, TabType, FileTreeNode } from '../types';
import { FILE_TREE_DATA } from '../data/mockData';
import { 
  Folder, 
  FolderOpen, 
  FileCode, 
  Search, 
  Copy, 
  Check, 
  Code2, 
  ChevronRight, 
  ChevronDown, 
  ExternalLink, 
  ShieldAlert, 
  Info, 
  Zap, 
  RefreshCw, 
  Sparkles, 
  Layers, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

interface FilesBrowserViewProps {
  skillLevel: SkillLevel;
  onNavigateTab: (tab: TabType) => void;
  selectedFile?: string;
  onSelectFile?: (filePath: string) => void;
}

export const FilesBrowserView: React.FC<FilesBrowserViewProps> = ({
  skillLevel,
  onNavigateTab,
  selectedFile = "src/services/PaymentProcessor.ts",
  onSelectFile
}) => {
  const [activeMode, setActiveMode] = useState<'junior' | 'mid' | 'senior'>('mid');
  const [treeSearch, setTreeSearch] = useState<string>("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'folder-src': true,
    'folder-services': true,
    'folder-controllers': true,
    'folder-models': false,
    'folder-middleware': false,
    'folder-config': false,
    'folder-workers': false,
  });
  const [rawView, setRawView] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(`import { Injectable, Logger } from '@nestjs/common';
import { CircuitBreaker, CircuitBreakerPolicy } from '@infra/resilience';
import { DistributedLockService } from '@infra/cache/redis-lock';
import { StripeGateway, AdyenGateway } from './gateways';
import { PaymentRequestDto, ProcessResultDto } from '@dto/payment.dto';

export interface PaymentContext {
  correlationId: string;
  attemptCount: number;
  idempotencyKey: string;
}

@Injectable()
export class PaymentProcessor {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly lockService: DistributedLockService,
    private readonly stripeGateway: StripeGateway,
    private readonly adyenGateway: AdyenGateway,
  ) {}

  public async executeTransaction(dto: PaymentRequestDto): Promise<ProcessResultDto> {
    const acquired = await this.lockService.acquireLock(dto.idempotencyKey, 30_000);
    if (!acquired) {
      this.logger.warn(\`Duplicate transaction attempt suppressed: \${dto.idempotencyKey}\`);
      throw new IdempotencyConflictException('Request concurrently running');
    }

    try {
      const gateway = dto.currency === 'EUR' ? this.adyenGateway : this.stripeGateway;
      this.logger.log(\`Routing \${dto.amount} \${dto.currency} via \${gateway.providerName}\`);

      await this.lockService.extendLease(dto.idempotencyKey, 15_000);

      const settlementResponse = await CircuitBreaker.run(
        CircuitBreakerPolicy.FAIL_FAST,
        async () => gateway.chargeCard(dto.token, dto.amount)
      );

      return new ProcessResultDto({ status: 'SUCCESS', txId: settlementResponse.id });
    } catch (err) {
      this.logger.error('Failed transaction', err);
      throw err;
    }
  }
}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden bg-[#0b1326] relative select-none">
      {/* LEFT PANE: Directory Browser */}
      <aside className="w-full lg:w-80 flex-shrink-0 bg-[#0d1527] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col justify-between shadow-xl z-10">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Tree Header & Quick Search */}
          <div className="p-4 space-y-3 bg-[#0d1527] border-b border-slate-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Folder className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-xs tracking-wide">Workspace Tree</span>
              </div>
              <span className="font-mono text-[11px] text-slate-400 bg-[#171f33] px-2 py-0.5 rounded border border-slate-700/60">
                62 files
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={treeSearch}
                onChange={e => setTreeSearch(e.target.value)}
                placeholder="Filter files by name, type, or concept..."
                className="w-full bg-[#060e20] text-slate-200 placeholder:text-slate-400 text-xs pl-8 pr-10 py-1.5 rounded-lg border border-slate-700/80 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate-400 bg-[#171f33] px-1 rounded border border-slate-700">⌘F</span>
            </div>
          </div>

          {/* Tree Nodes Viewport */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
            {/* Root /src Folder */}
            <div>
              <div 
                onClick={() => toggleFolder('folder-src')}
                className="flex items-center gap-1.5 px-2 py-1 text-white font-semibold rounded hover:bg-[#171f33] cursor-pointer transition-colors"
              >
                {expandedFolders['folder-src'] ? <ChevronDown className="w-3.5 h-3.5 text-cyan-400" /> : <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />}
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                <span>src</span>
                <span className="ml-auto text-[10px] text-slate-400 font-normal">root</span>
              </div>

              {expandedFolders['folder-src'] && (
                <div className="ml-3 pl-2.5 border-l border-slate-800 space-y-1 mt-1">
                  {/* config */}
                  <div>
                    <div 
                      onClick={() => toggleFolder('folder-config')}
                      className="flex items-center gap-1 px-2 py-1 rounded text-slate-400 hover:bg-[#171f33] hover:text-white cursor-pointer"
                    >
                      {expandedFolders['folder-config'] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <Folder className="w-3.5 h-3.5 text-cyan-400" />
                      <span>config</span>
                      <span className="ml-auto text-[10px] text-slate-400">2</span>
                    </div>
                  </div>

                  {/* controllers */}
                  <div>
                    <div 
                      onClick={() => toggleFolder('folder-controllers')}
                      className="flex items-center gap-1 px-2 py-1 rounded text-slate-400 hover:bg-[#171f33] hover:text-white cursor-pointer"
                    >
                      {expandedFolders['folder-controllers'] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <Folder className="w-3.5 h-3.5 text-cyan-400" />
                      <span>controllers</span>
                      <span className="ml-auto text-[10px] text-slate-400">4</span>
                    </div>
                    {expandedFolders['folder-controllers'] && (
                      <div className="ml-3 pl-2 border-l border-slate-800 space-y-0.5 mt-1">
                        <div 
                          onClick={() => {
                            if (onSelectFile) onSelectFile("src/controllers/CheckoutController.ts");
                          }}
                          className="flex items-center justify-between px-2 py-1 rounded text-slate-400 hover:bg-[#171f33] hover:text-white cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <FileCode className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate">CheckoutController.ts</span>
                          </div>
                          <span className="text-[9px] text-slate-400">ts</span>
                        </div>
                        <div 
                          onClick={() => {
                            if (onSelectFile) onSelectFile("src/controllers/RefundController.js");
                          }}
                          className="flex items-center justify-between px-2 py-1 rounded text-slate-400 hover:bg-[#171f33] hover:text-white cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <FileCode className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate">RefundController.js</span>
                          </div>
                          <span className="text-[9px] text-slate-400">js</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* middleware */}
                  <div>
                    <div 
                      onClick={() => toggleFolder('folder-middleware')}
                      className="flex items-center gap-1 px-2 py-1 rounded text-slate-400 hover:bg-[#171f33] hover:text-white cursor-pointer"
                    >
                      {expandedFolders['folder-middleware'] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <Folder className="w-3.5 h-3.5 text-cyan-400" />
                      <span>middleware</span>
                      <span className="ml-auto text-[10px] text-slate-400">3</span>
                    </div>
                  </div>

                  {/* models */}
                  <div>
                    <div 
                      onClick={() => toggleFolder('folder-models')}
                      className="flex items-center gap-1 px-2 py-1 rounded text-slate-400 hover:bg-[#171f33] hover:text-white cursor-pointer"
                    >
                      {expandedFolders['folder-models'] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <Folder className="w-3.5 h-3.5 text-cyan-400" />
                      <span>models</span>
                      <span className="ml-auto text-[10px] text-slate-400">5</span>
                    </div>
                  </div>

                  {/* services (ACTIVE) */}
                  <div>
                    <div 
                      onClick={() => toggleFolder('folder-services')}
                      className="flex items-center gap-1 px-2 py-1 rounded text-white font-medium hover:bg-[#171f33] cursor-pointer"
                    >
                      {expandedFolders['folder-services'] ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronRight className="w-3 h-3 text-cyan-400" />}
                      <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                      <span>services</span>
                      <span className="ml-auto text-[10px] bg-cyan-950/60 text-cyan-300 border border-cyan-800/80 px-1.5 rounded-full font-bold">4</span>
                    </div>

                    {expandedFolders['folder-services'] && (
                      <div className="ml-3 pl-2 border-l border-slate-800 space-y-0.5 mt-1">
                        {/* PaymentProcessor.ts (ACTIVE SELECTED FILE) */}
                        <div 
                          onClick={() => {
                            if (onSelectFile) onSelectFile("src/services/PaymentProcessor.ts");
                          }}
                          className={`relative flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-all ${
                            selectedFile.includes("PaymentProcessor.ts")
                              ? 'bg-[#171f33] text-cyan-300 border border-indigo-500/40 shadow-sm'
                              : 'text-slate-400 hover:bg-[#171f33] hover:text-white'
                          }`}
                        >
                          {selectedFile.includes("PaymentProcessor.ts") && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 rounded-l" />
                          )}
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="truncate font-semibold text-white">PaymentProcessor.ts</span>
                          </div>
                          <span className="flex items-center gap-1 text-[9px] text-cyan-400 bg-[#222a3d] px-1.5 py-0.5 rounded font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            CORE
                          </span>
                        </div>

                        {/* RefundService.js */}
                        <div 
                          onClick={() => {
                            if (onSelectFile) onSelectFile("src/services/RefundService.js");
                          }}
                          className={`flex items-center justify-between px-2.5 py-1 rounded cursor-pointer transition-all ${
                            selectedFile.includes("RefundService.js")
                              ? 'bg-[#171f33] text-rose-300 border border-rose-500/40 font-semibold'
                              : 'text-slate-400 hover:bg-[#171f33] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <FileCode className="w-3.5 h-3.5 text-rose-400" />
                            <span className="truncate">RefundService.js</span>
                          </div>
                          <span className="text-[9px] text-slate-400">js</span>
                        </div>

                        {/* StripeGateway.ts */}
                        <div 
                          onClick={() => {
                            if (onSelectFile) onSelectFile("src/services/StripeGateway.ts");
                          }}
                          className="flex items-center justify-between px-2.5 py-1 rounded text-slate-400 hover:bg-[#171f33] hover:text-white cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <FileCode className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate">StripeGateway.ts</span>
                          </div>
                          <span className="text-[9px] text-slate-400">ts</span>
                        </div>

                        {/* AdyenGateway.ts */}
                        <div 
                          onClick={() => {
                            if (onSelectFile) onSelectFile("src/services/AdyenGateway.ts");
                          }}
                          className="flex items-center justify-between px-2.5 py-1 rounded text-slate-400 hover:bg-[#171f33] hover:text-white cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <FileCode className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate">AdyenGateway.ts</span>
                          </div>
                          <span className="text-[9px] text-slate-400">ts</span>
                        </div>

                        {/* TokenVault.ts */}
                        <div 
                          onClick={() => {
                            if (onSelectFile) onSelectFile("src/services/TokenVault.ts");
                          }}
                          className="flex items-center justify-between px-2.5 py-1 rounded text-slate-400 hover:bg-[#171f33] hover:text-white cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <FileCode className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate">TokenVault.ts</span>
                          </div>
                          <span className="text-[9px] text-slate-400">ts</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* workers */}
                  <div>
                    <div 
                      onClick={() => toggleFolder('folder-workers')}
                      className="flex items-center gap-1 px-2 py-1 rounded text-slate-400 hover:bg-[#171f33] hover:text-white cursor-pointer"
                    >
                      {expandedFolders['folder-workers'] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <Folder className="w-3.5 h-3.5 text-cyan-400" />
                      <span>workers</span>
                      <span className="ml-auto text-[10px] text-slate-400">1</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Telemetry Pill Footer */}
          <div className="p-3 bg-[#060e20] border-t border-slate-800 flex items-center justify-between text-slate-400 font-mono text-[11px]">
            <div className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Parser cache primed</span>
            </div>
            <span className="text-slate-500">v2.14-ast</span>
          </div>
        </div>
      </aside>

      {/* RIGHT PANE: Code Reader & Adaptive Telemetry Canvas */}
      <section className="flex-1 flex flex-col bg-[#0b1326] min-w-0 overflow-y-auto">
        {/* File Metadata Header */}
        <header className="bg-[#0d1527] px-6 py-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-800 shadow-sm sticky top-0 z-20 backdrop-blur-md">
          <div className="flex flex-col gap-1 min-w-0 font-mono">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="hover:text-white transition-colors cursor-pointer">src</span>
              <span>/</span>
              <span className="hover:text-white transition-colors cursor-pointer">services</span>
              <span>/</span>
              <span className="text-cyan-300 font-semibold">{selectedFile.split('/').pop()}</span>
              <span className="ml-2 px-1.5 py-0.5 rounded bg-[#222a3d] text-slate-300 text-[10px]">TypeScript</span>
            </div>

            {/* File Stats Pills */}
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="flex items-center gap-1 text-[11px] text-slate-300 bg-[#171f33] px-2 py-0.5 rounded border border-slate-800">
                <span>412 Lines</span>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-slate-300 bg-[#171f33] px-2 py-0.5 rounded border border-slate-800">
                <span>24 Functions</span>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/80 px-2 py-0.5 rounded">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>Blast Tier: Critical (High Hub)</span>
              </span>
            </div>
          </div>

          {/* Quick Action Tooling */}
          <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
            <button
              type="button"
              onClick={() => onNavigateTab('impact')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#222a3d] hover:bg-[#2d3a54] text-cyan-300 border border-cyan-500/30 font-semibold transition-all group shadow-sm"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400 group-hover:rotate-45 transition-transform" />
              <span>View Blast Impact</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#171f33] text-slate-300 hover:text-white hover:bg-[#222a3d] border border-slate-700/80 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={() => setRawView(!rawView)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#171f33] text-slate-300 hover:text-white hover:bg-[#222a3d] border border-slate-700/80 transition-colors"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{rawView ? 'Formatted' : 'Raw View'}</span>
            </button>
          </div>
        </header>

        {/* Associated Architectural Concepts */}
        <div className="px-6 py-2 bg-[#060e20]/80 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto text-xs font-mono">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            Architectural Patterns:
          </span>
          <div className="flex items-center gap-1.5">
            <span 
              onClick={() => onNavigateTab('techniques')}
              className="px-2 py-0.5 rounded bg-[#171f33] text-cyan-300 border border-slate-700/60 hover:bg-[#222a3d] transition-colors cursor-pointer"
            >
              #Dependency-Injection
            </span>
            <span 
              onClick={() => onNavigateTab('techniques')}
              className="px-2 py-0.5 rounded bg-[#171f33] text-cyan-300 border border-slate-700/60 hover:bg-[#222a3d] transition-colors cursor-pointer"
            >
              #Circuit-Breaker-Pattern
            </span>
            <span 
              onClick={() => onNavigateTab('techniques')}
              className="px-2 py-0.5 rounded bg-[#171f33] text-cyan-300 border border-slate-700/60 hover:bg-[#222a3d] transition-colors cursor-pointer"
            >
              #Idempotent-Consumer
            </span>
            <span 
              onClick={() => onNavigateTab('techniques')}
              className="px-2 py-0.5 rounded bg-[#171f33] text-slate-300 border border-slate-700/60 hover:bg-[#222a3d] transition-colors cursor-pointer"
            >
              #Distributed-Ledger-Reconciliation
            </span>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6 space-y-6">
          {/* Adaptive AST Insight Card */}
          <article className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-xl bg-[#131b2e]/80">
            {/* Header with Mode Tabs */}
            <div className="bg-[#171f33] px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-sm text-white">Adaptive AST Insight</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Gemini 1.5 Telemetry
                </span>
              </div>

              {/* Tabs */}
              <div className="inline-flex p-0.5 rounded-lg bg-[#060e20] text-slate-400 font-mono text-xs border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveMode('junior')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    activeMode === 'junior'
                      ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                      : 'hover:text-white'
                  }`}
                >
                  Junior Summary
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('mid')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    activeMode === 'mid'
                      ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                      : 'hover:text-white'
                  }`}
                >
                  Mid-Level Flow
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('senior')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    activeMode === 'senior'
                      ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                      : 'hover:text-white'
                  }`}
                >
                  Senior Architect
                </button>
              </div>
            </div>

            {/* Dynamic Content */}
            <div className="p-6">
              {activeMode === 'junior' && (
                <div className="space-y-3 font-sans">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                      <Info className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm mb-1">What does this file do?</h4>
                      <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                        This file acts like the head cashier at a major retail bank. Whenever a user clicks <code className="font-mono text-cyan-300">"Pay Now"</code>, this code verifies their balance, talks to the Stripe or Adyen payment networks safely, and guarantees customers never get billed twice even if they press the button multiple times.
                      </p>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#060e20] border border-emerald-500/30 flex items-center gap-2 text-emerald-400 text-xs font-mono">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Safe to edit: Unit tests have 94% coverage on happy-path charge transactions.</span>
                  </div>
                </div>
              )}

              {activeMode === 'mid' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans text-xs">
                  {/* Col 1 */}
                  <div className="bg-[#060e20] p-4 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-cyan-400 font-mono font-semibold uppercase tracking-wider text-[11px]">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Execution Pipeline</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Orchestrates transactional debiting through gateway routing logic. Pulls merchant credentials, claims an ephemeral idempotency lock via Redis, and dispatches asynchronously to queue workers upon settlement.
                    </p>
                  </div>

                  {/* Col 2 */}
                  <div className="bg-[#060e20] p-4 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-indigo-400 font-mono font-semibold uppercase tracking-wider text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Crucial Invariants</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Atomic double-entry ledger guarantee. State can never reach <code className="font-mono text-cyan-300">SETTLED</code> without matching debit and credit journal rows inserted in <code className="font-mono text-cyan-300">LedgerWorker</code>.
                    </p>
                  </div>

                  {/* Col 3 */}
                  <div className="bg-[#060e20] p-4 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-rose-400 font-mono font-semibold uppercase tracking-wider text-[11px]">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Key Failure Modes</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Redis socket drop during distributed lock acquisition will throw <code className="font-mono text-rose-300">LockLeaseError</code> and fallback to 503 Backpressure. Gateway timeout defaults to circuit trip.
                    </p>
                  </div>
                </div>
              )}

              {activeMode === 'senior' && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="bg-[#060e20] p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-cyan-400 flex items-center gap-1.5">
                        <Zap className="w-4 h-4" />
                        Concurrency &amp; High-Frequency Latency Profile
                      </span>
                      <span className="text-emerald-400 font-bold">P99: 142ms | QPS Ceiling: ~4,200</span>
                    </div>
                    <p className="text-slate-300 font-sans leading-relaxed text-xs">
                      The primary bottleneck is line 34 (lock renewal step-up algorithm). When Redis network latency spikes past 28ms, the async lock lease renewals pile up in the Node.js event loop macro-task queue, degrading concurrent HTTP connection pooling. Consider migrating lock verification to an in-memory local probabilistic cache (e.g. Cuckoo filter) prior to hitting the shared cluster.
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 text-slate-300">
                      <div className="p-2 rounded bg-[#171f33] border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">MUTEX CONFLICTS</span>
                        <span className="font-semibold text-cyan-300">0.08% / req</span>
                      </div>
                      <div className="p-2 rounded bg-[#171f33] border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">GC PAUSE IMPACT</span>
                        <span className="font-semibold text-emerald-300">~4.1ms avg</span>
                      </div>
                      <div className="p-2 rounded bg-[#171f33] border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">IDEMPOTENCY DRIFT</span>
                        <span className="font-semibold text-indigo-300">0 ms (Zero Tol)</span>
                      </div>
                      <div className="p-2 rounded bg-[#171f33] border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">CIRCUIT TRIPS (24H)</span>
                        <span className="font-semibold text-rose-400">2 events</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </article>

          {/* Syntax-Highlighted Code Canvas */}
          <div className="bg-[#060e20] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col font-mono text-xs">
            {/* Sub-header */}
            <div className="bg-[#0d1527] px-4 py-2.5 flex items-center justify-between text-slate-400 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-slate-200 font-medium">PaymentProcessor.ts</span>
                <span className="text-slate-500">UTF-8 • CRLF</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  AST Synthesized
                </span>
                <span className="text-slate-500">Lines 1 - 42 of 412</span>
              </div>
            </div>

            {/* Code Lines with AST Annotations */}
            <div className="p-4 overflow-x-auto leading-relaxed text-slate-300">
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">1</td>
                    <td><span className="text-indigo-400 font-semibold">import</span> &#123; Injectable, Logger &#125; <span className="text-indigo-400 font-semibold">from</span> <span className="text-emerald-400">'@nestjs/common'</span>;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">2</td>
                    <td><span className="text-indigo-400 font-semibold">import</span> &#123; CircuitBreaker, CircuitBreakerPolicy &#125; <span className="text-indigo-400 font-semibold">from</span> <span className="text-emerald-400">'@infra/resilience'</span>;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">3</td>
                    <td><span className="text-indigo-400 font-semibold">import</span> &#123; DistributedLockService &#125; <span className="text-indigo-400 font-semibold">from</span> <span className="text-emerald-400">'@infra/cache/redis-lock'</span>;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">4</td>
                    <td><span className="text-indigo-400 font-semibold">import</span> &#123; StripeGateway, AdyenGateway &#125; <span className="text-indigo-400 font-semibold">from</span> <span className="text-emerald-400">'./gateways'</span>;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">5</td>
                    <td><span className="text-indigo-400 font-semibold">import</span> &#123; PaymentRequestDto, ProcessResultDto &#125; <span className="text-indigo-400 font-semibold">from</span> <span className="text-emerald-400">'@dto/payment.dto'</span>;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">6</td>
                    <td className="text-slate-500">// Types &amp; Interfaces for local processing scope</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">7</td>
                    <td><span className="text-indigo-400 font-semibold">export interface</span> <span className="text-cyan-400">PaymentContext</span> &#123;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">8</td>
                    <td className="pl-4">correlationId: <span className="text-cyan-400">string</span>;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">9</td>
                    <td className="pl-4">attemptCount: <span className="text-cyan-400">number</span>;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">10</td>
                    <td className="pl-4">idempotencyKey: <span className="text-cyan-400">string</span>;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">11</td>
                    <td>&#125;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">12</td>
                    <td>&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">13</td>
                    <td><span className="text-cyan-400">@Injectable</span>()</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">14</td>
                    <td><span className="text-indigo-400 font-semibold">export class</span> <span className="text-yellow-300 font-bold">PaymentProcessor</span> &#123;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">15</td>
                    <td className="pl-4"><span className="text-indigo-400 font-semibold">private readonly</span> logger = <span className="text-indigo-400 font-semibold">new</span> <span className="text-cyan-400">Logger</span>(PaymentProcessor.name);</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">16</td>
                    <td className="pl-4">&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">17</td>
                    <td className="pl-4"><span className="text-indigo-400 font-semibold">constructor</span>(</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">18</td>
                    <td className="pl-8"><span className="text-indigo-400 font-semibold">private readonly</span> lockService: <span className="text-cyan-400">DistributedLockService</span>,</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">19</td>
                    <td className="pl-8"><span className="text-indigo-400 font-semibold">private readonly</span> stripeGateway: <span className="text-cyan-400">StripeGateway</span>,</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">20</td>
                    <td className="pl-8"><span className="text-indigo-400 font-semibold">private readonly</span> adyenGateway: <span className="text-cyan-400">AdyenGateway</span>,</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">21</td>
                    <td className="pl-4">) &#123;&#125;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">22</td>
                    <td className="pl-4">&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">23</td>
                    <td className="pl-4"><span className="text-indigo-400 font-semibold">public async</span> <span className="text-blue-400 font-semibold">executeTransaction</span>(dto: <span className="text-cyan-400">PaymentRequestDto</span>): <span className="text-cyan-400">Promise</span>&lt;<span className="text-cyan-400">ProcessResultDto</span>&gt; &#123;</td>
                  </tr>

                  {/* LINE 24 (CRITICAL ANNOTATION: Idempotency Lock) */}
                  <tr className="bg-cyan-950/40 border-l-2 border-cyan-400 group">
                    <td className="w-10 select-none text-right pr-4 text-cyan-400 font-bold">24</td>
                    <td className="pl-8 flex items-center justify-between py-0.5">
                      <div>
                        <span className="text-indigo-400 font-semibold">const</span> acquired = <span className="text-indigo-400 font-semibold">await</span> <span className="text-indigo-300">this</span>.lockService.acquireLock(dto.idempotencyKey, 30_000);
                      </div>
                      <div className="relative group/pill shrink-0 ml-4">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold flex items-center gap-1 cursor-help">
                          @ Idempotency Lock
                        </span>
                        <div className="absolute right-0 bottom-full mb-1 w-64 p-3 bg-[#171f33] text-slate-200 rounded-xl shadow-2xl text-[11px] border border-slate-700 hidden group-hover/pill:block z-30 pointer-events-none">
                          <span className="font-bold text-cyan-300 block mb-1">Distributed Mutex Invariant:</span>
                          Guarantees exactly-once execution. Prevents concurrent duplicate debit requests if the user spams the checkout trigger.
                        </div>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">25</td>
                    <td className="pl-8"><span className="text-indigo-400 font-semibold">if</span> (!acquired) &#123;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">26</td>
                    <td className="pl-12"><span className="text-indigo-300">this</span>.logger.warn(`Duplicate transaction attempt suppressed: $&#123;dto.idempotencyKey&#125;`);</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">27</td>
                    <td className="pl-12"><span className="text-indigo-400 font-semibold">throw new</span> <span className="text-rose-400 font-bold">IdempotencyConflictException</span>('Request concurrently running');</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">28</td>
                    <td className="pl-8">&#125;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">29</td>
                    <td className="pl-8">&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">30</td>
                    <td className="pl-8"><span className="text-indigo-400 font-semibold">try</span> &#123;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">31</td>
                    <td className="pl-12"><span className="text-indigo-400 font-semibold">const</span> gateway = dto.currency === 'EUR' ? <span className="text-indigo-300">this</span>.adyenGateway : <span className="text-indigo-300">this</span>.stripeGateway;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">32</td>
                    <td className="pl-12"><span className="text-indigo-300">this</span>.logger.log(`Routing $&#123;dto.amount&#125; $&#123;dto.currency&#125; via $&#123;gateway.providerName&#125;`);</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">33</td>
                    <td className="pl-12">&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">34</td>
                    <td className="pl-12"><span className="text-indigo-400 font-semibold">await</span> <span className="text-indigo-300">this</span>.lockService.extendLease(dto.idempotencyKey, 15_000);</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">35</td>
                    <td className="pl-12">&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">36</td>
                    <td className="pl-12 text-slate-500">// Invoke through resilience policy wrapper to catch network drops</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">37</td>
                    <td className="pl-12"><span className="text-indigo-400 font-semibold">const</span> settlementResponse = <span className="text-indigo-400 font-semibold">await</span> CircuitBreaker.run(</td>
                  </tr>

                  {/* LINE 38 (CRITICAL ANNOTATION: Circuit Breaker Active) */}
                  <tr className="bg-rose-950/40 border-l-2 border-rose-500 group">
                    <td className="w-10 select-none text-right pr-4 text-rose-400 font-bold">38</td>
                    <td className="pl-16 flex items-center justify-between py-0.5">
                      <div>
                        <span className="text-cyan-400">CircuitBreakerPolicy</span>.FAIL_FAST,
                      </div>
                      <div className="relative group/breaker shrink-0 ml-4">
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold flex items-center gap-1 cursor-help">
                          ⚡ Circuit Breaker Active
                        </span>
                        <div className="absolute right-0 bottom-full mb-1 w-64 p-3 bg-[#171f33] text-slate-200 rounded-xl shadow-2xl text-[11px] border border-slate-700 hidden group-hover/breaker:block z-30 pointer-events-none">
                          <span className="font-bold text-rose-400 block mb-1">Fault Isolation Boundary:</span>
                          Trips to OPEN state if 5 consecutive calls fail within 10 seconds. Prevents thread pool exhaustion during gateway outages.
                        </div>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">39</td>
                    <td className="pl-16"><span className="text-indigo-400 font-semibold">async</span> () =&gt; gateway.chargeCard(dto.token, dto.amount)</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">40</td>
                    <td className="pl-12">);</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">41</td>
                    <td className="pl-12">&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="w-10 select-none text-right pr-4 text-slate-600">42</td>
                    <td className="pl-12"><span className="text-indigo-400 font-semibold">return new</span> <span className="text-cyan-400">ProcessResultDto</span>(&#123; status: 'SUCCESS', txId: settlementResponse.id &#125;);</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Code View Footer */}
            <div className="px-4 py-2 bg-[#0d1527] flex items-center justify-between text-slate-500 font-mono text-[10px] border-t border-slate-800">
              <div className="flex items-center gap-3">
                <span>TypeScript 5.3.3</span>
                <span>•</span>
                <span className="text-cyan-400">Strict Mode: Enabled</span>
                <span>•</span>
                <span className="text-emerald-400">Zero Unresolved Symbols</span>
              </div>
              <div className="flex items-center gap-2">
                <span>Ln 24, Col 18</span>
                <span>Spaces: 2</span>
              </div>
            </div>
          </div>

          {/* Dependency Impact Mini Banner */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 bg-[#131b2e]/80">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-white">Downstream Blast Radius: 9 Dependents</h4>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-950/80 text-rose-300 font-bold border border-rose-800">
                    Tier-1 File
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  Modifications to <span className="font-mono text-slate-200">PaymentProcessor</span> cascade directly into 2 API Controllers, 3 Event Handlers, and the Ledger Worker.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('chakra')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-md shrink-0"
            >
              <span>Explore Dependency Graph</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
