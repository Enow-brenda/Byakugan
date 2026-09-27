import React, { useState } from 'react';
import { X, Copy, Check, Share2, Globe, Shield, Download, ExternalLink } from 'lucide-react';
import { downloadByakuganReport, openByakuganReportInNewTab } from '../services/reportService';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState<boolean>(false);
  const shareUrl = "https://byakugan.internal/reports/payments-backend#impact";

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1527] border border-slate-700/80 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative animate-fade-in font-sans">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Share2 className="w-5 h-5 text-indigo-400" />
            <span>Share Interactive Report</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Deploy a shareable, interactive AST telemetry snapshot of <span className="font-mono text-cyan-300">payments-backend</span> to your engineering team or pull request discussion:
        </p>

        {/* Link Box */}
        <div className="bg-[#060e20] p-2.5 rounded-xl border border-slate-800 flex items-center justify-between font-mono text-xs text-slate-300">
          <span className="truncate mr-2 text-slate-400">{shareUrl}</span>
          <button
            type="button"
            onClick={handleCopy}
            className={`px-3 py-1 text-white rounded-lg text-xs font-semibold font-sans transition flex items-center gap-1 ${
              copied ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 text-xs font-mono">
          <div className="p-3 rounded-xl bg-[#131b2e] border border-slate-800">
            <span className="text-[10px] text-slate-400 block uppercase">Permissions</span>
            <span className="text-white font-semibold flex items-center gap-1 mt-0.5">
              <Globe className="w-3.5 h-3.5 text-cyan-400" /> Organization Internal
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#131b2e] border border-slate-800">
            <span className="text-[10px] text-slate-400 block uppercase">Integrity</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" /> Plan Mode Sealed
            </span>
          </div>
        </div>

        {/* Report Generation Actions */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Standalone Byakugan Report
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <button
              type="button"
              onClick={() => openByakuganReportInNewTab()}
              className="w-full sm:w-auto flex-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open HTML Report</span>
            </button>

            <button
              type="button"
              onClick={() => downloadByakuganReport()}
              className="w-full sm:w-auto flex-1 px-3 py-2 rounded-xl bg-[#171f33] hover:bg-[#222a3d] text-cyan-300 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .HTML</span>
            </button>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#171f33] hover:bg-[#222a3d] text-slate-300 text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

