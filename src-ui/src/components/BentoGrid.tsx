import React from "react";
import { SearchResult } from "../types";
import { ResultCard } from "./ResultCard";
import { Search, Sparkles } from "lucide-react";

interface BentoGridProps {
  results: SearchResult[];
  isSearching: boolean;
  onSelect: (result: SearchResult) => void;
  onRevealExplorer: (path: string) => void;
  onOpenEditor: (path: string, line: number) => void;
  onFindSimilar: (path: string) => void;
}

export const BentoGrid: React.FC<BentoGridProps> = ({
  results,
  isSearching,
  onSelect,
  onRevealExplorer,
  onOpenEditor,
  onFindSimilar,
}) => {
  if (isSearching) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-1">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="glass-card rounded-xl p-4 h-44 animate-pulse flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="h-4 bg-slate-700/50 rounded w-1/3" />
              <div className="h-4 bg-slate-700/50 rounded w-12" />
            </div>
            <div className="h-3 bg-slate-700/40 rounded w-3/4 my-2" />
            <div className="h-16 bg-slate-900/50 rounded w-full" />
            <div className="flex justify-between mt-2">
              <div className="h-5 bg-slate-700/40 rounded w-16" />
              <div className="h-5 bg-slate-700/40 rounded w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
        <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 mb-4 shadow-inner">
          <Search className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-slate-200 mb-1">
          로컬 시멘틱 검색을 시작하세요
        </h3>
        <p className="text-xs text-slate-400 max-w-md leading-relaxed">
          자연어 질의 또는 코드 키워드를 상단 입력창에 입력하세요.<br />
          EmbeddingGemma-2 256d 모델이 의미론적 유사도 기반으로 최적의 문서와 코드를 찾아냅니다.
        </p>
        <div className="flex items-center gap-2 mt-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-sky-400" />
            원본 파일 절대 무훼손 (Read-Only) 보장
          </span>
          <span>•</span>
          <span>Zero-Cloud Recall 방지 필터링</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-1">
      {results.map((res) => (
        <ResultCard
          key={res.chunk.id}
          result={res}
          onSelect={onSelect}
          onRevealExplorer={onRevealExplorer}
          onOpenEditor={onOpenEditor}
          onFindSimilar={onFindSimilar}
        />
      ))}
    </div>
  );
};
