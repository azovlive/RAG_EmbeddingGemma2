import React from "react";
import { SearchResult } from "../types";
import { FolderOpen, ExternalLink, Copy, Check, Sparkles, FileCode, BookOpen, Cpu } from "lucide-react";

interface ResultCardProps {
  result: SearchResult;
  onSelect: (result: SearchResult) => void;
  onRevealExplorer: (path: string) => void;
  onOpenEditor: (path: string, line: number) => void;
  onFindSimilar: (path: string) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({
  result,
  onSelect,
  onRevealExplorer,
  onOpenEditor,
  onFindSimilar,
}) => {
  const [copied, setCopied] = React.useState(false);
  const { chunk, score } = result;

  const scorePct = Math.round(score * 100);
  const scoreColor =
    scorePct >= 85
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : scorePct >= 70
      ? "text-sky-400 bg-sky-500/10 border-sky-500/20"
      : "text-slate-400 bg-slate-500/10 border-slate-500/20";

  const getExtIcon = (ext: string) => {
    switch (ext.toLowerCase()) {
      case "py":
      case "ipynb":
        return <FileCode className="w-3.5 h-3.5 text-yellow-400" />;
      case "cpp":
      case "c":
      case "h":
      case "hpp":
        return <Cpu className="w-3.5 h-3.5 text-blue-400" />;
      case "md":
      case "markdown":
        return <BookOpen className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <FileCode className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(chunk.file_path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const snippetLines = chunk.content.split("\n").slice(0, 5).join("\n");

  return (
    <div
      onClick={() => onSelect(result)}
      className="glass-card rounded-xl p-4 flex flex-col gap-2.5 transition-all cursor-pointer group hover:scale-[1.005] hover:shadow-lg relative overflow-hidden"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded bg-slate-800/80 border border-white/5">
            {getExtIcon(chunk.ext)}
          </div>
          <span className="font-semibold text-slate-200 text-sm truncate" title={chunk.file_name}>
            {chunk.file_name}
          </span>
          {chunk.symbol && (
            <span className="text-[11px] font-mono text-sky-400 px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-800/40 truncate">
              {chunk.symbol}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono text-slate-500">
            L{chunk.start_line}-L{chunk.end_line}
          </span>
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${scoreColor}`}>
            {scorePct}%
          </span>
        </div>
      </div>

      {/* Path Breadcrumb */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono truncate gap-2 bg-slate-900/40 px-2 py-1 rounded border border-white/5">
        <span className="truncate" title={chunk.display_path}>
          {chunk.display_path}
        </span>
        <button
          onClick={handleCopyPath}
          className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 shrink-0"
          title="파일 전체 경로 복사"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Code Snippet Box */}
      <div className="bg-slate-950/70 rounded-lg p-2.5 border border-white/5 font-mono text-xs text-slate-300 overflow-hidden relative">
        <pre className="whitespace-pre-wrap break-all line-clamp-4 leading-relaxed font-sans sm:font-mono text-[11px]">
          {snippetLines}
        </pre>
        <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-slate-950/80 to-transparent pointer-events-none" />
      </div>

      {/* Action Toolbar */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenEditor(chunk.file_path, chunk.start_line);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[11px]"
            title="에디터에서 열기"
          >
            <ExternalLink className="w-3 h-3 text-sky-400" />
            <span>열기</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRevealExplorer(chunk.file_path);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[11px]"
            title="윈도우 탐색기에서 파일 위치 열기"
          >
            <FolderOpen className="w-3 h-3 text-amber-400" />
            <span>탐색기</span>
          </button>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onFindSimilar(chunk.file_path);
          }}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-sky-500/10 text-sky-400 hover:text-sky-300 transition-colors text-[11px]"
          title="이 파일과 비슷한 문서/코드 찾기"
        >
          <Sparkles className="w-3 h-3" />
          <span>유사 파일</span>
        </button>
      </div>
    </div>
  );
};
