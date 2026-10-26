import React, { useEffect, useState } from "react";
import { SearchResult, SimilarFileResult, DbChunk, getFileCategory } from "../types";
import { api } from "../api";
import { ImagePreview } from "./ImagePreview";
import { VideoPreview } from "./VideoPreview";
import { DocumentPreview } from "./DocumentPreview";
import {
  X,
  ExternalLink,
  FolderOpen,
  Copy,
  Check,
  Sparkles,
  FileCode,
  Image as ImageIcon,
  Film,
  BookOpen,
  Layers
} from "lucide-react";

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
  const category = getFileCategory(chunk.ext);

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
    if (category === "image" || category === "video" || category === "document") {
      api.openFileDefault(chunk.file_path);
    } else {
      api.openInEditor(chunk.file_path, chunk.start_line);
    }
  };

  const handleRevealExplorer = () => {
    api.revealInExplorer(chunk.file_path);
  };

  return (
    <>
      {/* Backdrop overlay: starts below TitleBar (top-10), clicking closes inspector */}
      <div
        className="fixed inset-0 top-10 bg-black/60 backdrop-blur-xs z-30 transition-opacity animate-in fade-in duration-200 cursor-pointer"
        onClick={onClose}
        title="화면을 클릭하여 닫기"
      />

      {/* Sheet Drawer: starts strictly at top-10 (40px) below TitleBar */}
      <div className="fixed top-10 bottom-0 right-0 w-full sm:w-[540px] md:w-[620px] glass-panel z-40 flex flex-col shadow-2xl border-l border-white/10 animate-in slide-in-from-right duration-200">
        {/* Top Header: clearly visible below TitleBar with prominent close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg border ${
              category === "image"
                ? "bg-emerald-500/10 border-emerald-400/20 text-emerald-400"
                : category === "video"
                ? "bg-purple-500/10 border-purple-400/20 text-purple-400"
                : category === "document"
                ? "bg-amber-500/10 border-amber-400/20 text-amber-400"
                : "bg-sky-500/10 border-sky-400/20 text-sky-400"
            }`}>
              {category === "image" ? (
                <ImageIcon className="w-4 h-4" />
              ) : category === "video" ? (
                <Film className="w-4 h-4" />
              ) : category === "document" ? (
                <BookOpen className="w-4 h-4" />
              ) : (
                <FileCode className="w-4 h-4" />
              )}
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

          {/* Prominent High-Contrast Close Button */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-200 hover:text-white bg-slate-800 hover:bg-rose-600/80 border border-white/10 hover:border-rose-500/40 transition-all shadow-sm shrink-0 cursor-pointer"
            title="닫기 (Esc)"
          >
            <X className="w-4 h-4" />
            <span className="text-xs font-semibold">닫기</span>
          </button>
        </div>

        {/* Meta Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-950/60 border-b border-white/5 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40">
              {category === "image"
                ? `이미지 (${chunk.ext.toUpperCase()})`
                : category === "video"
                ? `동영상 (${chunk.ext.toUpperCase()})`
                : category === "document"
                ? `${chunk.ext.toLowerCase() === "pdf" ? `PDF Page ${chunk.start_line}` : `문서 (${chunk.ext.toUpperCase()})`}`
                : chunk.symbol ? chunk.symbol : `L${chunk.start_line} - L${chunk.end_line}`}
            </span>
            <span className="text-[11px] text-slate-400">
              {category === "image"
                ? "단일 이미지 에셋"
                : category === "video"
                ? "비디오 미디어 스트림"
                : category === "document"
                ? "문서 텍스트 본문"
                : `라인 ${chunk.start_line} ~ ${chunk.end_line}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              일치도 {scorePct}%
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-slate-900/60 text-xs shrink-0">
          <button
            onClick={handleOpenEditor}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>
              {category === "image"
                ? "사진 앱에서 열기"
                : category === "video"
                ? "미디어 플레이어에서 재생"
                : category === "document"
                ? (chunk.ext.toLowerCase() === "pdf" ? "PDF 뷰어로 열기" : "기본 앱으로 열기")
                : "에디터에서 열기"}
            </span>
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
        <div className="flex items-center border-b border-white/10 px-4 gap-4 bg-slate-900/60 text-xs shrink-0">
          <button
            onClick={() => setActiveTab("code")}
            className={`py-2 font-medium border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "code"
                ? "border-sky-400 text-sky-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {category === "image" ? (
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
            ) : category === "video" ? (
              <Film className="w-3.5 h-3.5 text-purple-400" />
            ) : category === "document" ? (
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <FileCode className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span>
              {category === "image"
                ? "이미지 뷰어"
                : category === "video"
                ? "비디오 플레이어"
                : category === "document"
                ? "문서 내용"
                : "코드 내용"}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("similar")}
            className={`py-2 font-medium border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "similar"
                ? "border-sky-400 text-sky-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
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
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>파일 내 청크 ({fileChunks.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === "code" && (
            category === "image" ? (
              <ImagePreview
                mode="full"
                filePath={chunk.file_path}
                fileName={chunk.file_name}
                ext={chunk.ext}
                onOpenDefault={() => api.openFileDefault(chunk.file_path)}
              />
            ) : category === "video" ? (
              <VideoPreview
                mode="full"
                filePath={chunk.file_path}
                fileName={chunk.file_name}
                ext={chunk.ext}
                onOpenDefault={() => api.openFileDefault(chunk.file_path)}
              />
            ) : category === "document" ? (
              <DocumentPreview
                mode="full"
                filePath={chunk.file_path}
                fileName={chunk.file_name}
                ext={chunk.ext}
                content={chunk.content}
                startLine={chunk.start_line}
                endLine={chunk.end_line}
                onOpenDefault={() => api.openFileDefault(chunk.file_path)}
              />
            ) : (
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
            )
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
                  const simCat = getFileCategory(sim.ext);
                  return (
                    <div
                      key={i}
                      onClick={() => onSelectSimilarFile(sim.display_path)}
                      className="p-3 rounded-lg glass-card hover:bg-slate-800/80 cursor-pointer transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {simCat === "image" ? (
                          <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : simCat === "video" ? (
                          <Film className="w-4 h-4 text-purple-400 shrink-0" />
                        ) : simCat === "document" ? (
                          <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <FileCode className="w-4 h-4 text-sky-400 shrink-0" />
                        )}
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
    </>
  );
};
