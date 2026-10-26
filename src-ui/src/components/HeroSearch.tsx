import React, { useRef, useEffect } from "react";
import { Search, Loader2, X } from "lucide-react";

interface HeroSearchProps {
  query: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  isSearching: boolean;
  resultCount: number;
  searchLatencyMs: number | null;
}

export const HeroSearch: React.FC<HeroSearchProps> = ({
  query,
  onChange,
  onSearch,
  isSearching,
  resultCount,
  searchLatencyMs,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key.toLowerCase() === "k") || (e.key === "/" && document.activeElement !== inputRef.current)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSearch();
    }
  };

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="relative flex items-center">
        <div className="absolute left-4 text-slate-400 pointer-events-none">
          {isSearching ? (
            <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
          ) : (
            <Search className="w-5 h-5 text-slate-400" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="자연어 질문 또는 코드 조각 검색... (예: tree-sitter 파서 에러 처리 방법)"
          className="w-full h-12 pl-12 pr-28 rounded-xl bg-slate-900/80 border border-white/10 hover:border-white/20 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/20 text-slate-100 placeholder-slate-500 text-sm font-medium transition-all shadow-inner outline-none"
        />

        <div className="absolute right-3 flex items-center gap-2">
          {query.length > 0 && (
            <button
              onClick={() => onChange("")}
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
              title="검색어 지우기"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onSearch}
            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-all shadow-sm active:scale-95"
          >
            검색
          </button>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] text-slate-400 font-mono bg-slate-800 rounded border border-slate-700">
            Ctrl K
          </kbd>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
        <div>
          {searchLatencyMs !== null ? (
            <span>
              {resultCount}개 항목 발견 ({searchLatencyMs.toFixed(1)}ms)
            </span>
          ) : (
            <span>시멘틱 벡터 검색 대기 중</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>Enter로 즉시 검색</span>
          <span>•</span>
          <span>MRL 256d L2 Cosine Matching</span>
        </div>
      </div>
    </div>
  );
};
