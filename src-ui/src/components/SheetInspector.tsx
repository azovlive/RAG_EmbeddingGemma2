import React, { useEffect, useState } from "react";
import { SearchResult, SimilarFileResult, DbChunk } from "../types";
import { api } from "../api";
import { X, ExternalLink, FolderOpen, Copy, Check, Sparkles, FileCode, BookOpen, Layers } from "lucide-react";

interface SheetInspectorProps {
  selectedResult: SearchResult | null;
  onClose: () => void;
  onSelectSimilarFile: (filePath: string) => void;
}

export const SheetInspector: React.FC<SheetInspectorProps> = ({
  selectedResult,
  onClose,
  onSelectSimilarFile,
}) => {
  const [similarFiles, setSimilarFiles] = useState<SimilarFileResult[]>([]);
  const [fileChunks, setFileChunks] = useState<DbChunk[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "similar" | "chunks">("code");

  useEffect(() => {
    if (selectedResult) {
      // Load similar files
      api.getSimilarFiles(selectedResult.chunk.file_path, 6)
        .then(setSimilarFiles)
        .catch(console.error);

      // Load all chunks from this file
      (api as any).getFileChunks?.(selectedResult.chunk.file_path)
        .then((chunks: DbChunk[]) => {
          if (chunks) setFileChunks(chunks);
        })
        .catch(console.error);
    } else {
      setSimilarFiles([]);
      setFileChunks([]);
    }
  }, [selectedResult]);

  if (!selectedResult) return null;

  const { chunk, score } = selectedResult;
  const scorePct = Math.round(score * 100);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(chunk.content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(chunk.file_path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  const handleOpenEditor = () => {
    api.openInEditor(chunk.file_path, chunk.start_line);
  };

  const handleRevealExplorer = () => {
    api.revealInExplorer(chunk.file_path);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] md:w-[560px] glass-panel z-40 flex flex-col shadow-2xl border-l border-white/10 animate-in slide-in-from-right duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-900/80">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-400/20 text-sky-400">
            <FileCode className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100 truncate" title={chunk.file_name}>
              {chunk.file_name}
            </h2>
            <p className="text-[11px] text-slate-400 font-mono truncate" title={chunk.display_path}>
              {chunk.display_path}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors"
          title="닫기 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Meta Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/40 border-b border-white/5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40">
            {chunk.symbol ? chunk.symbol : `L${chunk.start_line} - L${chunk.end_line}`}
          </span>
          <span className="text-[11px] text-slate-400">
            라인 {chunk.start_line} ~ {chunk.end_line}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            일치도 {scorePct}%
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-slate-900/40 text-xs">
        <button
          onClick={handleOpenEditor}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors shadow-sm"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>에디터에서 열기</span>
        </button>

        <button
          onClick={handleRevealExplorer}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-white/10"
        >
          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          <span>탐색기 열기</span>
        </button>

        <button
          onClick={handleCopyPath}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-white/10"
          title="전체 파일 경로 복사"
        >
          {copiedPath ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center border-b border-white/10 px-4 gap-4 bg-slate-900/60 text-xs">
        <button
          onClick={() => setActiveTab("code")}
          className={`py-2 font-medium border-b-2 transition-all ${
            activeTab === "code"
              ? "border-sky-400 text-sky-300"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          코드 내용
        </button>
        <button
          onClick={() => setActiveTab("similar")}
          className={`py-2 font-medium border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "similar"
              ? "border-sky-400 text-sky-300"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="w-3 h-3 text-sky-400" />
          <span>유사 파일 ({similarFiles.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("chunks")}
          className={`py-2 font-medium border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "chunks"
              ? "border-sky-400 text-sky-300"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-3 h-3 text-sky-400" />
          <span>파일 내 청크 ({fileChunks.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "code" && (
          <div className="relative group">
            <div className="absolute right-2 top-2 z-10">
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs border border-white/10 transition-colors shadow-sm"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? "복사됨" : "코드 복사"}</span>
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed select-text whitespace-pre-wrap">
              {chunk.content}
            </pre>
          </div>
        )}

        {activeTab === "similar" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-400 mb-1">
              현재 파일과 벡터 공간에서 의미론적으로 가장 유사한 상위 파일 목록입니다.
            </p>
            {similarFiles.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                유사한 파일 계산 중...
              </div>
            ) : (
              similarFiles.map((sim, i) => {
                const simPct = Math.round(sim.score * 100);
                return (
                  <div
                    key={i}
                    onClick={() => onSelectSimilarFile(sim.display_path)}
                    className="p-3 rounded-lg glass-card hover:bg-slate-800/80 cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="w-4 h-4 text-sky-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-200 truncate">
                          {sim.file_name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {sim.display_path}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-sky-400 font-bold shrink-0 ml-2">
                      {simPct}%
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "chunks" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-400 mb-1">
              이 파일에서 추출된 모든 AST 구문/문서 청크 목록입니다.
            </p>
            {fileChunks.map((fc, i) => (
              <div key={i} className="p-3 rounded-lg bg-slate-950/70 border border-white/5 space-y-1">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-sky-400 font-bold">{fc.symbol || `청크 #${fc.chunk_index}`}</span>
                  <span className="text-slate-500">L{fc.start_line}-L{fc.end_line}</span>
                </div>
                <pre className="text-[10px] font-mono text-slate-400 line-clamp-3 whitespace-pre-wrap">
                  {fc.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
