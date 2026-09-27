import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TabType, SkillLevel } from './types';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewView } from './components/OverviewView';
import { ChakraNetworkView } from './components/ChakraNetworkView';
import { ImpactSightView } from './components/ImpactSightView';
import { FilesBrowserView } from './components/FilesBrowserView';
import { TechniquesView } from './components/TechniquesView';
import { CopilotDrawer } from './components/CopilotDrawer';
import { ShareModal } from './components/ShareModal';
import { PrSafetyPlanModal } from './components/PrSafetyPlanModal';

const normalizeTab = (rawHash: string): TabType => {
  const clean = rawHash.replace(/^#/, '').toLowerCase().trim();
  if (clean === 'impact' || clean === 'impact-sight') return 'impact';
  if (clean === 'files' || clean === 'files-browser') return 'files';
  if (clean === 'chakra' || clean === 'chakra-network') return 'chakra';
  if (clean === 'techniques' || clean === 'patterns') return 'techniques';
  return 'overview';
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    return normalizeTab(window.location.hash);
  });

  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermediate');
  const [targetFile, setTargetFile] = useState<string>("src/services/PaymentProcessor.ts");
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);
  const [prModalOpen, setPrModalOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync tab with URL hash on popstate and hashchange
  useEffect(() => {
    const handleHashSync = () => {
      const target = normalizeTab(window.location.hash);
      setActiveTab(target);
    };
    window.addEventListener('hashchange', handleHashSync);
    window.addEventListener('popstate', handleHashSync);
    return () => {
      window.removeEventListener('hashchange', handleHashSync);
      window.removeEventListener('popstate', handleHashSync);
    };
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    // Smoothly update URL hash without jarring auto-scroll
    window.history.replaceState(null, '', `#${tab}`);
    // Reset scroll position for next view
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1326] text-[#dae2fd] flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Persistent Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="md:pl-64 flex-1 flex flex-col min-h-screen">
        {/* Top Header */}
        <Header
          skillLevel={skillLevel}
          onSkillLevelChange={setSkillLevel}
          onOpenShareModal={() => setShareModalOpen(true)}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />

        {/* Viewport for Active Tab with soft animation and fixed stable layout */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeInOut" }}
              className="flex-1 h-full flex flex-col min-h-0"
            >
              {activeTab === 'overview' && (
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                  <OverviewView
                    skillLevel={skillLevel}
                    onNavigateTab={handleTabChange}
                  />
                </div>
              )}

              {activeTab === 'chakra' && (
                <ChakraNetworkView
                  skillLevel={skillLevel}
                  onNavigateTab={handleTabChange}
                  onSelectInspectFile={(file) => setTargetFile(file)}
                />
              )}

              {activeTab === 'impact' && (
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                  <ImpactSightView
                    skillLevel={skillLevel}
                    onNavigateTab={handleTabChange}
                    targetFile={targetFile}
                    onSelectTargetFile={setTargetFile}
                    onOpenPrModal={() => setPrModalOpen(true)}
                  />
                </div>
              )}

              {activeTab === 'files' && (
                <FilesBrowserView
                  skillLevel={skillLevel}
                  onNavigateTab={handleTabChange}
                  selectedFile={targetFile}
                  onSelectFile={setTargetFile}
                />
              )}

              {activeTab === 'techniques' && (
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                  <TechniquesView
                    skillLevel={skillLevel}
                    onNavigateTab={handleTabChange}
                    onSelectInspectFile={(file) => setTargetFile(file)}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Floating Byakugan Copilot / Codebase AI Drawer */}
      <CopilotDrawer currentFile={targetFile} />

      {/* Share Report Modal */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />

      {/* PR Safety Plan Modal */}
      <PrSafetyPlanModal
        isOpen={prModalOpen}
        onClose={() => setPrModalOpen(false)}
        targetFile={targetFile}
      />
    </div>
  );
}
