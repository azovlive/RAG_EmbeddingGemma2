import React, { useState, useEffect } from "react";
import { SearchResult, KnowledgeBundle } from "./types";
import { api } from "./api";
import { TitleBar } from "./components/TitleBar";
import { BundleSelector } from "./components/BundleSelector";
import { HeroSearch } from "./components/HeroSearch";
import { BentoGrid } from "./components/BentoGrid";
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInitialSetup, setIsInitialSetup] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);

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
      return;
    }

    setIsSearching(true);
    const start = performance.now();
    try {
      const res = await api.search(query, selectedBundleId, 24);
      setResults(res);
      setSearchLatencyMs(performance.now() - start);
    } catch (e: any) {
      console.error("Search failed:", e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSimilarFile = async (filePath: string) => {
    try {
      // Find chunk for that file or set search
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
    setIsIndexing(true);
    try {
      await api.triggerIndexing();
    } catch (e: any) {
      console.error("Index trigger failed:", e);
    } finally {
      setTimeout(() => setIsIndexing(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950/90 text-slate-100 font-sans select-none">
      {/* Frameless Mica TitleBar */}
      <TitleBar onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Main App Container */}
      <div className="flex-1 flex flex-col px-4 pt-3 pb-2 gap-3 overflow-hidden">
        {/* Top Controls: Bundle Selector */}
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

        {/* Results Bento Grid */}
        <main className="flex-1 overflow-y-auto pr-1">
          <BentoGrid
            results={results}
            isSearching={isSearching}
            onSelect={(res) => setSelectedResult(res)}
            onRevealExplorer={handleRevealExplorer}
            onOpenEditor={handleOpenEditor}
            onFindSimilar={(path) => handleSelectSimilarFile(path)}
          />
        </main>
      </div>

      {/* Bottom Status & Resource Bar */}
      <StatusBar onTriggerIndex={handleTriggerIndex} isIndexing={isIndexing} />

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
