import React, { useState } from 'react';
import { SkillLevel, TabType } from '../types';
import { 
  Search, 
  AlertTriangle, 
  Brain, 
  ShieldCheck, 
  Radio, 
  GitBranch, 
  CheckSquare, 
  XCircle, 
  ExternalLink, 
  ChevronDown, 
  ChevronRight, 
  Play, 
  FileDown, 
  Sparkles, 
  CheckCircle2, 
  Cpu, 
  Zap,
  Activity,
  ArrowRight
} from 'lucide-react';
import { downloadByakuganReport } from '../services/reportService';

interface ImpactSightViewProps {
  skillLevel: SkillLevel;
  onNavigateTab: (tab: TabType) => void;
  targetFile: string;
  onSelectTargetFile: (file: string) => void;
  onOpenPrModal: () => void;
}

export const ImpactSightView: React.FC<ImpactSightViewProps> = ({
  skillLevel,
  onNavigateTab,
  targetFile,
  onSelectTargetFile,
  onOpenPrModal,
}) => {
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({
    'step-1': true,
    'step-2': false,
    'step-3': false,
    'step-4': false,
  });

  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [allCollapsed, setAllCollapsed] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationComplete, setSimulationComplete] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleStepToggle = (stepId: string) => {
    setCheckedSteps(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const toggleNodeCollapse = (nodeId: string) => {
    setCollapsedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const toggleAllCollapse = () => {
    const nextState = !allCollapsed;
    setAllCollapsed(nextState);
    setCollapsedNodes({
      'node-1': nextState,
      'node-2': nextState,
      'node-3': nextState,
      'node-4': nextState,
    });
  };

  const handleSimulate = () => {
    setIsSimulating(true);
    setSimulationComplete(false);
    showToast("Running AST runtime mutation ripple simulation...");
    setTimeout(() => {
      setIsSimulating(false);
      setSimulationComplete(true);
      showToast("Simulation verified: 7 direct nodes, 19 indirect nodes mapped!");
    }, 1800);
  };

  const handleExport = () => {
    const report = {
      target: targetFile,
      timestamp: new Date().toISOString(),
      blastRadiusScore: 8.8,
      riskLevel: "HIGH IMPACT",
      directNodes: 7,
      indirectNodes: 19,
      dependents: [
        "src/controllers/CheckoutController.ts:84",
        "src/workers/SubscriptionRenewWorker.ts:122",
        "src/integrations/StripeWebhookHandler.ts:45",
        "src/graphql/resolvers/Mutation.ts:210"
      ],
      checklistCompletion: Object.values(checkedSteps).filter(Boolean).length + " / 4",
      uncoveredEdgeCases: [
        "Double-capture edge case when Redis lock fails concurrently during 3DS callback resolution"
      ]
    };
    navigator.clipboard?.writeText(JSON.stringify(report, null, 2));
    const targetBaseName = targetFile.split('/').pop() || 'module';
    downloadByakuganReport(targetFile, `byakugan-report-${targetBaseName}.html`);
    showToast("Impact JSON copied & HTML Report generated!");
  };

  return (
    <div className="space-y-6 max-w-[1720px] mx-auto pb-12">
      {/* Target Inspection File Search & Quick Selector Context Box */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-800 bg-[#131b2e]/90 shadow-md overflow-hidden space-y-3.5">
        {/* Top Tier: File Search Bar + Status Badges */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0 group">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400" />
            <input
              type="text"
              value={targetFile}
              onChange={e => onSelectTargetFile(e.target.value)}
              placeholder="Search symbol, AST node, or absolute path..."
              className="w-full bg-[#060e20] text-slate-100 font-mono text-xs sm:text-sm pl-10 pr-20 py-2.5 rounded-xl border border-slate-700/80 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all shadow-inner"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <span className="font-mono text-[10px] text-slate-400 bg-[#171f33] px-1.5 py-0.5 rounded border border-slate-700/80 shadow-sm">⌘K</span>
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold shadow-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              {targetFile.includes('Refund') ? 'Blast Center' : (targetFile.includes('Stripe') ? 'Gateway Adapter' : (targetFile.includes('Ledger') ? 'Repository Layer' : 'Core Service'))}
            </span>
            <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-[#171f33] text-slate-300 border border-slate-800 font-medium">
              {targetFile.includes('Refund') ? '184 LOC' : (targetFile.includes('Stripe') ? '245 LOC' : (targetFile.includes('Ledger') ? '310 LOC' : '412 LOC'))}
            </span>
            <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 font-medium shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              AST Synced
            </span>
          </div>
        </div>

        {/* Bottom Tier: Quick Switch Target Pills (Cleanly wrapped inside context box) */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5 font-medium shrink-0">
              <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
              Switch Target:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: 'PaymentProcessor.ts', path: 'src/services/PaymentProcessor.ts' },
                { label: 'RefundService.js', path: 'src/services/RefundService.js' },
                { label: 'StripeClient.ts', path: 'src/gateways/StripeClient.ts' },
                { label: 'LedgerEntry.ts', path: 'src/repositories/LedgerEntry.ts' },
                { label: 'WebhookValidator.ts', path: 'src/workers/WebhookValidator.ts' },
              ].map(pill => {
                const isSelected = targetFile.includes(pill.label);
                return (
                  <button
                    key={pill.label}
                    type="button"
                    onClick={() => {
                      onSelectTargetFile(pill.path);
                      showToast(`Switched target: ${pill.label}`);
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-xs font-mono ${
                      isSelected
                        ? 'bg-rose-950/70 text-rose-300 border border-rose-500/60 font-semibold shadow-sm ring-1 ring-rose-500/30'
                        : 'bg-[#171f33] text-slate-300 hover:text-white hover:bg-[#222a3d] border border-slate-800'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-rose-400 animate-pulse' : 'bg-slate-500'}`} />
                    <span>{pill.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <span className="text-[11px] text-slate-500 font-mono hidden xl:inline">
            Directly binds AST telemetry and downstream callers
          </span>
        </div>
      </div>

      {/* Two-Column Grid: Left (Fragile Pattern, Semantics, Safe Plan) | Right (Blast Radius, Dependents Tree, Coverage) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN (6 Cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* 1. Fragile Pattern Warning Alert */}
          <div className="rounded-2xl p-5 bg-gradient-to-r from-rose-950/40 via-[#131b2e] to-[#131b2e] border border-rose-500/40 shadow-lg relative overflow-hidden">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 shrink-0 border border-rose-500/30">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-rose-300 tracking-wide">Fragile Pattern Detected</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold">
                    AST Rule: SEC-204
                  </span>
                </div>
                <p className="text-xs text-rose-100/90 leading-relaxed font-sans">
                  Direct mutation of state detected in <code className="font-mono text-[11px] bg-rose-950/80 px-1 py-0.5 rounded text-rose-200 border border-rose-800/80">catch</code> block without active rollback transaction. Mutex lock on Redis key may leak if network timeout triggers upstream gateway disconnect.
                </p>

                <div className="mt-2 p-2.5 rounded-lg bg-[#060e20] border border-rose-900/60 font-mono text-[11px] text-slate-300 space-y-1">
                  <div className="text-slate-500">// Vulnerable pattern in {targetFile.split('/').pop()}:74</div>
                  <div><span className="text-rose-400">-</span> context.txPayload.state = 'MUTATED'; <span className="text-amber-400">// Direct mutation</span></div>
                  <div><span className="text-emerald-400">+</span> const safeRecord = Object.freeze(&#123; ...context.txPayload, state: 'MUTATED' &#125;);</div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. "What It Does" Runtime Semantics */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4 bg-[#131b2e]/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                  <Activity className="w-4 h-4" />
                </div>
                <h2 className="font-bold text-base text-white">What It Does</h2>
              </div>
              <span className="font-mono text-xs text-slate-400">Runtime Semantics</span>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed font-sans">
              Orchestrates high-frequency payment execution pipelines. Acts as the primary state arbiter managing distributed circuit-breaker fallback between <strong className="text-white font-semibold">Stripe</strong> and <strong className="text-white font-semibold">Adyen</strong> gateways based on real-time latency triggers and response SLAs.
            </p>

            {/* Metrics Triplet */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-[#171f33] rounded-xl p-3 border border-slate-800 space-y-1">
                <span className="font-mono text-[10px] text-slate-400 block uppercase">Idempotency Model</span>
                <span className="text-xs font-mono font-bold text-cyan-300">Distributed Redis TTL</span>
              </div>
              <div className="bg-[#171f33] rounded-xl p-3 border border-slate-800 space-y-1">
                <span className="font-mono text-[10px] text-slate-400 block uppercase">Fallback Mechanism</span>
                <span className="text-xs font-mono font-bold text-emerald-300">Circuit Tripped (3 fail)</span>
              </div>
              <div className="bg-[#171f33] rounded-xl p-3 border border-slate-800 space-y-1">
                <span className="font-mono text-[10px] text-slate-400 block uppercase">Throughput Tier</span>
                <span className="text-xs font-mono font-bold text-indigo-300">Tier 1 (&gt;1,200 rps)</span>
              </div>
            </div>

            {/* Median Latency Metric */}
            <div className="bg-[#060e20] p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-24 h-6 text-cyan-400" fill="none" viewBox="0 0 100 24">
                  <path d="M0 14 Q20 4, 40 16 T70 8 T100 12" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                </svg>
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-white font-medium">Median Execution Latency</span>
                  <span className="font-mono text-[11px] text-slate-400">p95: 142ms • Error Rate: 0.04%</span>
                </div>
              </div>
              <span className="font-mono text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md font-semibold">
                Optimal
              </span>
            </div>
          </div>

          {/* 3. Suggested Safe Approach Checklist */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4 bg-[#131b2e]/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h2 className="font-bold text-base text-white">Suggested Safe Approach</h2>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                Plan Mode Verified
              </span>
            </div>

            <p className="text-xs text-slate-400 font-sans">
              Execute these modification safeguards sequentially before committing changes to avoid downstream regression in <code className="text-slate-200 font-mono">CheckoutController</code>.
            </p>

            <div className="space-y-2.5 font-mono text-xs">
              {/* Step 1 */}
              <div
                onClick={() => handleStepToggle('step-1')}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  checkedSteps['step-1']
                    ? 'bg-[#171f33] border-indigo-500/40 text-slate-200'
                    : 'bg-[#0f172a] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checkedSteps['step-1']}
                  onChange={() => {}}
                  className="mt-0.5 rounded bg-[#060e20] border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Step 1: Wrap Parameter Contract</span>
                    <span className="text-[10px] text-slate-400 bg-[#060e20] px-1.5 py-0.5 rounded">TS-AST-01</span>
                  </div>
                  <p className="text-slate-400 text-[11px] font-sans">
                    Wrap parameter changes into standard <code className="text-cyan-300">PaymentIntentConfig</code> interface signature to avoid downstream signature breaks.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div
                onClick={() => handleStepToggle('step-2')}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  checkedSteps['step-2']
                    ? 'bg-[#171f33] border-indigo-500/40 text-slate-200'
                    : 'bg-[#0f172a] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checkedSteps['step-2']}
                  onChange={() => {}}
                  className="mt-0.5 rounded bg-[#060e20] border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Step 2: Atomic Idempotency Check</span>
                    <span className="text-[10px] text-slate-400 bg-[#060e20] px-1.5 py-0.5 rounded">SEC-REDIS</span>
                  </div>
                  <p className="text-slate-400 text-[11px] font-sans">
                    Validate and reserve the idempotency key in Redis with atomic NX lock before dispatching upstream HTTP gateway socket call.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div
                onClick={() => handleStepToggle('step-3')}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  checkedSteps['step-3']
                    ? 'bg-[#171f33] border-indigo-500/40 text-slate-200'
                    : 'bg-[#0f172a] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checkedSteps['step-3']}
                  onChange={() => {}}
                  className="mt-0.5 rounded bg-[#060e20] border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Step 3: Correlation Telemetry</span>
                    <span className="text-[10px] text-slate-400 bg-[#060e20] px-1.5 py-0.5 rounded">OTEL-EVT</span>
                  </div>
                  <p className="text-slate-400 text-[11px] font-sans">
                    Emit <code className="text-cyan-300">payment.attempted</code> structured telemetry event enriched with transaction trace context.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div
                onClick={() => handleStepToggle('step-4')}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  checkedSteps['step-4']
                    ? 'bg-[#171f33] border-indigo-500/40 text-slate-200'
                    : 'bg-[#0f172a] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checkedSteps['step-4']}
                  onChange={() => {}}
                  className="mt-0.5 rounded bg-[#060e20] border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Step 4: Execute Payment Regression</span>
                    <span className="text-[10px] text-slate-400 bg-[#060e20] px-1.5 py-0.5 rounded">CI-E2E</span>
                  </div>
                  <p className="text-slate-400 text-[11px] font-sans">
                    Trigger automated regression suite via <code className="text-indigo-300">npm run test:e2e:payments</code> with mocked Adyen latency spikes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (6 Cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* 1. Blast Radius Assessment Indicator */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4 bg-[#131b2e]/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <span className="w-3.5 h-3.5 rounded-full bg-rose-500 animate-ping absolute opacity-75" />
                  <span className="w-3.5 h-3.5 rounded-full bg-rose-500 relative shadow-[0_0_8px_#f43f5e]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-base text-white">Blast Radius Indicator</h2>
                    <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-rose-950/80 text-rose-300 font-bold border border-rose-800">
                      Score: 8.8 / 10
                    </span>
                  </div>
                  <span className="text-xs text-rose-300 font-medium">High Blast Radius — Strict Review Mandatory</span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-[#060e20] px-3.5 py-2 rounded-xl border border-slate-800 shrink-0">
                <div className="text-right font-mono">
                  <div className="text-sm font-bold text-white">7 Direct</div>
                  <div className="text-[10px] text-slate-400">19 Indirect Nodes</div>
                </div>
                <GitBranch className="w-5 h-5 text-cyan-400" />
              </div>
            </div>

            {/* Distribution Meter */}
            <div className="space-y-1.5 pt-1">
              <div className="w-full bg-[#060e20] rounded-full h-3 overflow-hidden flex border border-slate-800">
                <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: '68%' }} title="Critical Path (68%)" />
                <div className="bg-cyan-500 h-full transition-all duration-500" style={{ width: '20%' }} title="Secondary Consumers (20%)" />
                <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: '12%' }} title="Telemetry & Audit (12%)" />
              </div>
              <div className="flex items-center justify-between text-slate-400 font-mono text-[10px]">
                <span className="text-rose-400 font-semibold">Critical Path (68%)</span>
                <span className="text-cyan-400">Secondary Consumers (20%)</span>
                <span className="text-emerald-400">Telemetry &amp; Audit (12%)</span>
              </div>
            </div>
          </div>

          {/* 2. Direct & Indirect Dependents Tree */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4 bg-[#131b2e]/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
                  <GitBranch className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-white">Direct &amp; Indirect Dependents Tree</h3>
              </div>
              <button
                type="button"
                onClick={toggleAllCollapse}
                className="font-mono text-xs text-cyan-400 hover:text-white transition-colors"
              >
                {allCollapsed ? 'Expand All' : 'Collapse All'}
              </button>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              {/* Dependent 1 */}
              <div className="rounded-xl bg-[#171f33] p-3 border border-slate-800 hover:border-slate-700 transition">
                <div 
                  onClick={() => toggleNodeCollapse('node-1')}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {collapsedNodes['node-1'] ? <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold shrink-0">
                      Direct Caller
                    </span>
                    <span className="text-white font-semibold truncate">src/controllers/CheckoutController.ts</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-slate-400">line 84</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateTab('files');
                        showToast("Jumped to CheckoutController.ts:84");
                      }}
                      className="px-2 py-0.5 rounded bg-[#060e20] hover:bg-indigo-600 hover:text-white text-indigo-300 border border-slate-700 text-[11px] transition-colors flex items-center gap-1"
                    >
                      <span>Jump</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {!collapsedNodes['node-1'] && (
                  <div className="mt-2 pl-6 space-y-1 text-[11px] text-slate-400 font-sans">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                      <span>Invokes <code className="text-white font-mono">PaymentProcessor.chargeCard()</code> inside express handler</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dependent 2 */}
              <div className="rounded-xl bg-[#171f33] p-3 border border-slate-800 hover:border-slate-700 transition">
                <div 
                  onClick={() => toggleNodeCollapse('node-2')}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {collapsedNodes['node-2'] ? <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold shrink-0">
                      Async Consumer
                    </span>
                    <span className="text-white font-semibold truncate">src/workers/SubscriptionRenewWorker.ts</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-slate-400">line 122</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateTab('files');
                        showToast("Jumped to SubscriptionRenewWorker.ts:122");
                      }}
                      className="px-2 py-0.5 rounded bg-[#060e20] hover:bg-indigo-600 hover:text-white text-indigo-300 border border-slate-700 text-[11px] transition-colors flex items-center gap-1"
                    >
                      <span>Jump</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {!collapsedNodes['node-2'] && (
                  <div className="mt-2 pl-6 space-y-1 text-[11px] text-slate-400 font-sans">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                      <span>Batch recurring billing scheduler with BullMQ queue worker</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dependent 3 */}
              <div className="rounded-xl bg-[#171f33] p-3 border border-slate-800 hover:border-slate-700 transition">
                <div 
                  onClick={() => toggleNodeCollapse('node-3')}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {collapsedNodes['node-3'] ? <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold shrink-0">
                      Event Listener
                    </span>
                    <span className="text-white font-semibold truncate">src/integrations/StripeWebhookHandler.ts</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-slate-400">line 45</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateTab('files');
                        showToast("Jumped to StripeWebhookHandler.ts:45");
                      }}
                      className="px-2 py-0.5 rounded bg-[#060e20] hover:bg-indigo-600 hover:text-white text-indigo-300 border border-slate-700 text-[11px] transition-colors flex items-center gap-1"
                    >
                      <span>Jump</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {!collapsedNodes['node-3'] && (
                  <div className="mt-2 pl-6 space-y-1 text-[11px] text-slate-400 font-sans">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span>Handles asynchronous refund &amp; dispute reconciliation payloads</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dependent 4 */}
              <div className="rounded-xl bg-[#171f33] p-3 border border-slate-800 hover:border-slate-700 transition">
                <div 
                  onClick={() => toggleNodeCollapse('node-4')}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {collapsedNodes['node-4'] ? <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shrink-0">
                      GraphQL Mutation
                    </span>
                    <span className="text-white font-semibold truncate">src/graphql/resolvers/Mutation.ts</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-slate-400">line 210</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateTab('files');
                        showToast("Jumped to Mutation.ts:210");
                      }}
                      className="px-2 py-0.5 rounded bg-[#060e20] hover:bg-indigo-600 hover:text-white text-indigo-300 border border-slate-700 text-[11px] transition-colors flex items-center gap-1"
                    >
                      <span>Jump</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {!collapsedNodes['node-4'] && (
                  <div className="mt-2 pl-6 space-y-1 text-[11px] text-slate-400 font-sans">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span>Public GraphQL schema node: <code className="text-white font-mono">checkoutOneClick</code></span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Test Coverage Gap Meter */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4 bg-[#131b2e]/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-white">Test Coverage Gap Meter</h3>
              </div>
              <span className="font-mono text-xs text-slate-400">Istanbul/Jest AST</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
              <div className="p-3 rounded-xl bg-[#171f33] border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Unit Coverage</span>
                  <span className="text-sm font-bold text-emerald-400">92% Passing</span>
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>

              <div className="p-3 rounded-xl bg-[#171f33] border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">E2E Flow Coverage</span>
                  <span className="text-sm font-bold text-rose-400">64% (Gap in Refund)</span>
                </div>
                <XCircle className="w-5 h-5 text-rose-400" />
              </div>
            </div>

            <div className="rounded-xl bg-rose-950/30 p-3.5 border border-rose-900/50 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-mono text-xs font-bold text-rose-300 block uppercase">Critical Uncovered Scenario</span>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  Double-capture edge case when Redis lock fails concurrently during 3DS callback resolution.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="glass-card rounded-2xl p-4 md:p-5 border border-slate-700/80 shadow-2xl sticky bottom-4 z-30 bg-[#0d1527]/95 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm md:text-base text-white">Target Ready for Modification</div>
              <div className="text-xs text-slate-400 font-sans">Analysis synthesized across 26 downstream call sites</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenPrModal}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
              <span>Generate PR Safety Plan</span>
            </button>

            <button
              type="button"
              onClick={handleSimulate}
              disabled={isSimulating}
              className="px-3.5 py-2 rounded-xl bg-[#171f33] hover:bg-[#222a3d] text-cyan-300 border border-cyan-500/30 font-semibold text-xs transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>{isSimulating ? 'Simulating...' : 'Simulate Blast Radius'}</span>
            </button>

            <button
              type="button"
              onClick={handleExport}
              className="px-3.5 py-2 rounded-xl bg-[#171f33] hover:bg-[#222a3d] text-slate-300 hover:text-white border border-slate-700/80 font-semibold text-xs transition-colors flex items-center gap-2"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Export Impact Matrix</span>
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-[#171f33] border border-slate-700 px-4 py-2 rounded-xl shadow-2xl text-white font-mono text-xs z-50 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
