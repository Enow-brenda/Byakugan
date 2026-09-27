import React, { useState } from 'react';
import { Bot, X, Send, Sparkles, CheckCircle2, Terminal } from 'lucide-react';

interface CopilotDrawerProps {
  currentFile: string;
}

interface Message {
  sender: 'copilot' | 'user';
  text: string;
  timestamp: string;
  code?: string;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ currentFile }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [inputVal, setInputVal] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'copilot',
      text: `I have analyzed ${currentFile.split('/').pop()}. Downstream blast radius touches 7 direct modules and 19 indirect consumers. Would you like me to draft an immutable patch for the state mutation or scaffold a Redis timeout unit test?`,
      timestamp: 'Just now',
    }
  ]);

  const handleSend = () => {
    if (!inputVal.trim()) return;

    const userMsg: Message = {
      sender: 'user',
      text: inputVal,
      timestamp: 'Just now'
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    const query = inputVal.toLowerCase();
    setInputVal("");

    setTimeout(() => {
      let reply = `Synthesizing AST inspection for ${currentFile.split('/').pop()}...`;
      let codeSnippet: string | undefined = undefined;

      if (query.includes("mutation") || query.includes("patch") || query.includes("line 74")) {
        reply = "Here is the recommended immutable patch removing direct argument mutation at line 74:";
        codeSnippet = `// Safe immutable cloning patch for ${currentFile.split('/').pop()}:74
const safeContext = Object.freeze({
  ...context.txPayload,
  state: 'PROCESSED',
  refundedAt: Date.now(),
});
return this.ledgerRepository.commitEntry(safeContext);`;
      } else if (query.includes("test") || query.includes("redis") || query.includes("timeout")) {
        reply = "Here is an Istanbul/Jest characterization test stub covering the Redis lock timeout scenario:";
        codeSnippet = `it('should trip circuit breaker and release Redis mutex on 504 gateway timeout', async () => {
  jest.spyOn(lockService, 'acquireLock').mockResolvedValue(true);
  jest.spyOn(stripeGateway, 'refund').mockRejectedValue(new GatewayTimeoutException());

  await expect(service.executeTransaction(mockDto))
    .rejects.toThrow(GatewayTimeoutException);
  
  expect(lockService.releaseLock).toHaveBeenCalledWith(mockDto.idempotencyKey);
});`;
      } else {
        reply = `I evaluated your request against AST call graph rules for ${currentFile.split('/').pop()}. All 26 downstream call sites remain verified under Plan Mode safeguards.`;
      }

      setMessages([...newMessages, {
        sender: 'copilot',
        text: reply,
        timestamp: 'Just now',
        code: codeSnippet
      }]);
    }, 700);
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-semibold text-xs shadow-2xl shadow-indigo-600/50 hover:scale-105 active:scale-95 transition-all border border-indigo-400/30"
        >
          <Bot className="w-4 h-4 text-cyan-300" />
          <span>Byakugan Copilot</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
        </button>
      </div>

      {/* Slide-Over Drawer Panel */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[420px] bg-[#0d1527]/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#060e20]/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Bot className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                <span>Byakugan AST Assistant</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h4>
              <span className="text-[11px] text-emerald-400 font-mono">
                Bound to: {currentFile.split('/').pop()}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border ${
                m.sender === 'copilot'
                  ? 'bg-[#060e20] border-slate-800 text-slate-200'
                  : 'bg-indigo-950/60 border-indigo-500/40 text-indigo-100 ml-6'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-bold ${m.sender === 'copilot' ? 'text-indigo-400' : 'text-cyan-300'}`}>
                  {m.sender === 'copilot' ? 'Byakugan Copilot' : 'You'}
                </span>
                <span className="text-[10px] text-slate-500">{m.timestamp}</span>
              </div>
              <p className="leading-relaxed font-sans text-xs">{m.text}</p>
              {m.code && (
                <div className="mt-2.5 p-2.5 rounded-lg bg-[#0a101f] border border-slate-700/80 font-mono text-[11px] text-cyan-300 overflow-x-auto">
                  <pre><code>{m.code}</code></pre>
                </div>
              )}
            </div>
          ))}

          {/* Quick Action Suggestion Chips */}
          <div className="pt-2 flex flex-col gap-1.5 font-mono text-[11px]">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Suggested Queries:</span>
            <button
              type="button"
              onClick={() => {
                setInputVal("Draft immutable patch for line 74 state mutation");
              }}
              className="text-left p-2 rounded-lg bg-[#171f33] hover:bg-[#222a3d] text-slate-300 border border-slate-800 transition"
            >
              ⚡ Draft immutable patch for line 74
            </button>
            <button
              type="button"
              onClick={() => {
                setInputVal("Generate unit test stub for Redis lock timeout");
              }}
              className="text-left p-2 rounded-lg bg-[#171f33] hover:bg-[#222a3d] text-slate-300 border border-slate-800 transition"
            >
              🧪 Generate Redis timeout characterization test
            </button>
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-800 bg-[#060e20]">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSend();
              }}
              placeholder="Ask about AST dependencies or risk..."
              className="flex-1 bg-[#131b2e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
            <button
              type="button"
              onClick={handleSend}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition shadow-md"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
