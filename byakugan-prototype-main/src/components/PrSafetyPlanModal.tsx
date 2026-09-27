import React, { useState } from 'react';
import { X, ShieldCheck, Copy, Check, CheckSquare, AlertTriangle, ArrowRight } from 'lucide-react';

interface PrSafetyPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetFile: string;
}

export const PrSafetyPlanModal: React.FC<PrSafetyPlanModalProps> = ({
  isOpen,
  onClose,
  targetFile,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const fileName = targetFile.split('/').pop() || targetFile;

  const planText = `# PR Safety Verification Plan: ${fileName}
Generated via Byakugan AST Telemetry

## 1. Blast Radius Summary
- Target: ${targetFile}
- Direct Egress/Ingress Nodes: 7 modules
- Indirect Dependent Consumers: 19 modules
- Risk Assessment: 8.8 / 10 (Strict Review Mandatory)

## 2. Pre-Commit Verification Sequence
[x] Step 1: Wrap Parameter Contract (TS-AST-01)
    - Preserve PaymentIntentConfig interface compatibility
[ ] Step 2: Atomic Idempotency Check (SEC-REDIS)
    - Acquire Redis mutex prior to external gateway invocation
[ ] Step 3: Correlation Telemetry (OTEL-EVT)
    - Emit payment.attempted with distributed traceparent context
[ ] Step 4: Execute Payment Regression (CI-E2E)
    - Run npm run test:e2e:payments with Adyen latency mocking

## 3. Automated Rollback Safeguards
- Circuit breaker trip threshold: 50% failure rate over 10s rolling window
- Automatic compensation: Compensating ledger debit reversal if Stripe round-trip fails
`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(planText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1527] border border-slate-700/80 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative animate-fade-in font-sans max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">PR Safety Verification Plan</h3>
              <span className="font-mono text-xs text-slate-400">Target: {fileName}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-4 text-xs font-mono pr-1">
          {/* Risk Card */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-rose-950/40 to-[#131b2e] border border-rose-900/60 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block">Impact Zone</span>
              <p className="text-white font-semibold">Strict 4-Step Review Policy Enforced</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded bg-rose-900/60 text-rose-300 font-bold border border-rose-700">
              Score: 8.8 / 10
            </span>
          </div>

          {/* Sequential Safeguards */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Required Sequence
            </span>

            <div className="p-3 rounded-xl bg-[#060e20] border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <CheckSquare className="w-4 h-4" />
                <span>1. Signature Isolation</span>
              </div>
              <p className="text-slate-400 font-sans pl-6">
                Wrap changes in <code className="text-cyan-300">PaymentIntentConfig</code> interface signature before mutating any controller routes.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[#060e20] border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                <CheckSquare className="w-4 h-4" />
                <span>2. Atomic Distributed Locking</span>
              </div>
              <p className="text-slate-400 font-sans pl-6">
                Reserve idempotency key using Redis <code className="text-indigo-300">SETNX</code> with lease extension prior to Stripe invocation.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[#060e20] border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold">
                <CheckSquare className="w-4 h-4" />
                <span>3. Characterization Harness</span>
              </div>
              <p className="text-slate-400 font-sans pl-6">
                Run Jest regression suite ensuring non-distributed 2PC network partition triggers automated compensation ledger rollbacks.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0 font-sans">
          <span className="text-[11px] text-slate-500 font-mono">Plan Mode: Certified for Merge</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Plan!' : 'Copy Plan for PR'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#171f33] hover:bg-[#222a3d] text-slate-300 text-xs font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
