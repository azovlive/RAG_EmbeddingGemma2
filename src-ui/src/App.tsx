import React, { useState, useEffect } from "react";
import { SearchResult, KnowledgeBundle } from "./types";
import { api } from "./api";
import { TitleBar } from "./components/TitleBar";
import { BundleSelector } from "./components/BundleSelector";
import { HeroSearch } from "./components/HeroSearch";
import { FileSidebar } from "./components/FileSidebar";
import { PreviewList } from "./components/PreviewList";
import { SheetInspector } from "./components/SheetInspector";
import { WizardModal } from "./components/WizardModal";
import { StatusBar } from "./components/StatusBar";

export const App: React.FC = () => {
  const [query, setQuery] = useState("");
  const [bundles, setBundles] = useState<KnowledgeBundle[]>([]);
  const [selectedBundleId, setSelectedBundleId] = useState("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLatencyMs, setSearchLatencyMs] = useState<number | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [previewLines, setPreviewLines] = useState<number>(7);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInitialSetup, setIsInitialSetup] = useState(false);

  // Load bundles and check first run on mount
  useEffect(() => {
    api.listBundles()
      .then(setBundles)
      .catch(console.error);

    api.checkFirstRun()
      .then((isFirst) => {
        if (isFirst) {
          setIsInitialSetup(true);
          setIsSettingsOpen(true);
        }
      })
      .catch(console.error);

    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedResult) setSelectedResult(null);
        else if (isSettingsOpen) setIsSettingsOpen(false);
      }
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      }
      if (e.ctrlKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleTriggerIndex();
      }
    };

    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [selectedResult, isSettingsOpen]);

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      setSearchLatencyMs(null);
      setActiveFilePath(null);
      return;
    }

    setIsSearching(true);
    const start = performance.now();
    try {
      const res = await api.search(query, selectedBundleId, 40);
      setResults(res);
      setSearchLatencyMs(performance.now() - start);
      if (res.length > 0) {
        setActiveFilePath(res[0].chunk.file_path);
      } else {
        setActiveFilePath(null);
      }
    } catch (e: any) {
      console.error("Search failed:", e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectFile = (filePath: string) => {
    setActiveFilePath(filePath);
    // Smoothly scroll the right preview list to this file's card
    const targetElement = document.getElementById(`file-card-${filePath}`);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleSelectSimilarFile = async (filePath: string) => {
    try {
      const res = await api.search(filePath, undefined, 5);
      if (res.length > 0) {
        setSelectedResult(res[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevealExplorer = (path: string) => {
    api.revealInExplorer(path);
  };

  const handleOpenEditor = (path: string, line: number) => {
    api.openInEditor(path, line);
  };

  const handleTriggerIndex = async () => {
    try {
      await api.triggerIndexing();
    } catch (e: any) {
      console.error("Index trigger failed:", e);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950/90 text-slate-100 font-sans select-none">
      {/* Frameless Mica TitleBar */}
      <TitleBar onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Main App Container */}
      <div className="flex-1 flex flex-col px-4 pt-2.5 pb-2 gap-2.5 overflow-hidden">
        {/* Top Controls: Bundle Selector & Quick Actions */}
        <div className="flex items-center justify-between gap-2">
          <BundleSelector
            bundles={bundles}
            selectedBundleId={selectedBundleId}
            onSelectBundle={(id) => {
              setSelectedBundleId(id);
              if (query.trim()) {
                setTimeout(handleSearch, 50);
              }
            }}
            onAddBundle={() => setIsSettingsOpen(true)}
          />
        </div>

        {/* Hero Search Section */}
        <HeroSearch
          query={query}
          onChange={setQuery}
          onSearch={handleSearch}
          isSearching={isSearching}
          resultCount={results.length}
          searchLatencyMs={searchLatencyMs}
        />

        {/* Master-Detail Split Pane: Left Sidebar + Right Preview */}
        <div className="flex-1 flex gap-3 overflow-hidden min-h-0">
          {/* Left Sidebar: Matched Files List */}
          <FileSidebar
            results={results}
            activeFilePath={activeFilePath}
            onSelectFile={handleSelectFile}
          />

          {/* Right Area: Sequential Preview with 5~10 lines toggle */}
          <PreviewList
            results={results}
            previewLines={previewLines}
            onChangePreviewLines={setPreviewLines}
            onSelectResult={(res) => setSelectedResult(res)}
            onRevealExplorer={handleRevealExplorer}
            onOpenEditor={handleOpenEditor}
            onFindSimilar={(path) => handleSelectSimilarFile(path)}
          />
        </div>
      </div>

      {/* Bottom Status & Resource Bar with Unified Indexing Controls */}
      <StatusBar onIndexComplete={handleSearch} />

      {/* Slide-over Inspector Sheet */}
      <SheetInspector
        selectedResult={selectedResult}
        onClose={() => setSelectedResult(null)}
        onSelectSimilarFile={handleSelectSimilarFile}
      />

      {/* Configuration & Wizard Modal */}
      <WizardModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          api.listBundles().then(setBundles);
        }}
        isInitialSetup={isInitialSetup}
      />
    </div>
  );
};

export default App;
