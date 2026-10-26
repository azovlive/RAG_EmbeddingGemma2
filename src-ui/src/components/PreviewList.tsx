import React, { useState } from "react";
import { SearchResult, getFileCategory } from "../types";
import { api } from "../api";
import { ImagePreview } from "./ImagePreview";
import { VideoPreview } from "./VideoPreview";
import { DocumentPreview } from "./DocumentPreview";
import {
  ExternalLink,
  FolderOpen,
  Copy,
  Check,
  Sparkles,
  FileCode,
  Sliders,
  Maximize2
} from "lucide-react";

interface PreviewListProps {
  results: SearchResult[];
  previewLines: number;
  onChangePreviewLines: (lines: number) => void;
  onSelectResult: (result: SearchResult) => void;
  onRevealExplorer: (path: string) => void;
  onOpenEditor: (path: string, line: number) => void;
  onFindSimilar: (path: string) => void;
}

export const PreviewList: React.FC<PreviewListProps> = ({
  results,
  previewLines,
  onChangePreviewLines,
  onSelectResult,
  onRevealExplorer,
  onOpenEditor,
  onFindSimilar,
}) => {
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);
  const [copiedPathChunkId, setCopiedPathChunkId] = useState<string | null>(null);

  const handleCopyCode = (e: React.MouseEvent, id: string, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedChunkId(id);
    setTimeout(() => setCopiedChunkId(null), 1500);
  };

  const handleCopyPath = (e: React.MouseEvent, id: string, path: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopiedPathChunkId(id);
    setTimeout(() => setCopiedPathChunkId(null), 1500);
  };

  return (
    <div className="flex-1 flex flex-col glass-panel rounded-xl overflow-hidden border border-white/10 select-none min-w-0">
      {/* Top Controls: Line count selector */}
      <div className="px-4 py-2.5 border-b border-white/10 bg-slate-900/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <FileCode className="w-4 h-4 text-sky-400" />
          <span>순차 미리보기</span>
          <span className="text-[11px] font-normal text-slate-400 font-mono">
            ({results.length}개 청크)
          </span>
        </div>

        {/* 5~10 줄 선택기 (Show lines selector) */}
        <div className="flex items-center gap-2 bg-slate-950/60 px-2.5 py-1 rounded-lg border border-white/10 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] font-medium">미리보기 줄수:</span>
          </div>

          <div className="flex items-center gap-1">
            {[5, 6, 7, 8, 9, 10].map((num) => (
              <button
                key={num}
                onClick={() => onChangePreviewLines(num)}
                className={`w-6 h-6 rounded text-[11px] font-mono font-medium transition-all ${
                  previewLines === num
                    ? "bg-sky-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/10"
                }`}
                title={`${num}줄 미리보기로 전환`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sequential Preview Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {results.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <p className="text-sm font-medium text-slate-300">검색 결과가 없습니다</p>
            <p className="text-xs text-slate-500 mt-1">
              상단 검색창에 검색어를 입력하거나 다른 RAG 묶음을 선택해 보세요.
            </p>
          </div>
        ) : (
          results.map((res, index) => {
            const { chunk, score } = res;
            const scorePct = Math.round(score * 100);
            const scoreColor =
              scorePct >= 85
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : scorePct >= 70
                ? "text-sky-400 bg-sky-500/10 border-sky-500/20"
                : "text-slate-400 bg-slate-500/10 border-slate-500/20";

            const category = getFileCategory(chunk.ext);

            // Slice content to user-selected previewLines
            const allLines = chunk.content.split("\n");
            const previewSlice = allLines.slice(0, previewLines);
            const hasMoreLines = allLines.length > previewLines;

            return (
              <div
                key={chunk.id}
                id={`file-card-${chunk.file_path}`}
                className="glass-card rounded-xl p-3.5 flex flex-col gap-2 transition-all hover:border-sky-500/40 relative group"
              >
                {/* Header: File Name, Symbol, Lines & Score */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-slate-500 shrink-0">
                      #{index + 1}
                    </span>
                    <span
                      className="font-bold text-slate-100 text-sm truncate"
                      title={chunk.file_name}
                    >
                      {chunk.file_name}
                    </span>

                    {chunk.symbol && (
                      <span className="text-[11px] font-mono text-sky-400 px-2 py-0.5 rounded bg-sky-950/60 border border-sky-800/40 truncate max-w-[240px]">
                        {chunk.symbol}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono text-slate-400">
                      {category === "image"
                        ? `이미지 (${chunk.ext.toUpperCase()})`
                        : category === "video"
                        ? `동영상 (${chunk.ext.toUpperCase()})`
                        : category === "document"
                        ? `${chunk.ext.toLowerCase() === "pdf" ? `PDF Page ${chunk.start_line}` : `문서 (${chunk.ext.toUpperCase()})`}`
                        : `L${chunk.start_line} - L${chunk.end_line}`}
                    </span>
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${scoreColor}`}
                    >
                      {scorePct}%
                    </span>
                  </div>
                </div>

                {/* Path bar */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono bg-slate-900/50 px-2.5 py-1 rounded border border-white/5 gap-2">
                  <span className="truncate" title={chunk.display_path}>
                    {chunk.display_path}
                  </span>
                  <button
                    onClick={(e) => handleCopyPath(e, chunk.id, chunk.file_path)}
                    className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 shrink-0"
                    title="전체 파일 경로 복사"
                  >
                    {copiedPathChunkId === chunk.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Content Preview: Image, Video, Document, or Code */}
                {category === "image" ? (
                  <ImagePreview
                    mode="thumbnail"
                    filePath={chunk.file_path}
                    fileName={chunk.file_name}
                    ext={chunk.ext}
                    onOpenInspector={() => onSelectResult(res)}
                    onOpenDefault={() => api.openFileDefault(chunk.file_path)}
                  />
                ) : category === "video" ? (
                  <VideoPreview
                    mode="thumbnail"
                    filePath={chunk.file_path}
                    fileName={chunk.file_name}
                    ext={chunk.ext}
                    onOpenInspector={() => onSelectResult(res)}
                    onOpenDefault={() => api.openFileDefault(chunk.file_path)}
                  />
                ) : category === "document" ? (
                  <DocumentPreview
                    mode="thumbnail"
                    filePath={chunk.file_path}
                    fileName={chunk.file_name}
                    ext={chunk.ext}
                    content={chunk.content}
                    startLine={chunk.start_line}
                    endLine={chunk.end_line}
                    onOpenInspector={() => onSelectResult(res)}
                    onOpenDefault={() => api.openFileDefault(chunk.file_path)}
                  />
                ) : (
                  <div className="bg-slate-950/80 rounded-lg p-2.5 border border-white/5 font-mono text-xs overflow-hidden relative">
                    <div className="flex">
                      {/* Line numbers column */}
                      <div className="select-none pr-3 text-right text-slate-600 font-mono text-[11px] leading-relaxed shrink-0">
                        {previewSlice.map((_, i) => (
                          <div key={i}>{chunk.start_line + i}</div>
                        ))}
                      </div>

                      {/* Code text */}
                      <pre className="text-slate-200 text-[11px] leading-relaxed overflow-x-auto whitespace-pre font-mono flex-1 select-text">
                        {previewSlice.join("\n")}
                      </pre>
                    </div>

                    {hasMoreLines && (
                      <div className="pt-1 text-[10px] text-slate-500 italic flex justify-between items-center border-t border-white/5 mt-1.5">
                        <span>... 외 {allLines.length - previewLines}줄 더 있음</span>
                        <button
                          onClick={() => onSelectResult(res)}
                          className="text-sky-400 hover:underline flex items-center gap-1"
                        >
                          <Maximize2 className="w-3 h-3" />
                          <span>전체 코드 펼쳐보기</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Bar */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    {category === "image" ? (
                      <button
                        onClick={() => api.openFileDefault(chunk.file_path)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors text-[11px]"
                        title="윈도우 기본 사진 뷰어로 열기"
                      >
                        <ExternalLink className="w-3 h-3 text-sky-400" />
                        <span>사진 앱 열기</span>
                      </button>
                    ) : category === "video" ? (
                      <button
                        onClick={() => api.openFileDefault(chunk.file_path)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors text-[11px]"
                        title="윈도우 미디어 플레이어로 재생"
                      >
                        <ExternalLink className="w-3 h-3 text-purple-400" />
                        <span>미디어 재생</span>
                      </button>
                    ) : category === "document" ? (
                      <button
                        onClick={() => api.openFileDefault(chunk.file_path)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors text-[11px]"
                        title="기본 문서 리더/앱으로 열기"
                      >
                        <ExternalLink className="w-3 h-3 text-emerald-400" />
                        <span>{chunk.ext.toLowerCase() === "pdf" ? "PDF 열기" : "문서 열기"}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onOpenEditor(chunk.file_path, chunk.start_line)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors text-[11px]"
                        title="VS Code 또는 기본 에디터로 열기"
                      >
                        <ExternalLink className="w-3 h-3 text-sky-400" />
                        <span>열기</span>
                      </button>
                    )}

                    <button
                      onClick={() => onRevealExplorer(chunk.file_path)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors text-[11px]"
                      title="윈도우 파일 탐색기에서 위치 열기"
                    >
                      <FolderOpen className="w-3 h-3 text-amber-400" />
                      <span>탐색기</span>
                    </button>

                    <button
                      onClick={(e) => handleCopyCode(e, chunk.id, chunk.content)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors text-[11px]"
                      title={category !== "code" ? "파일 내용/정보 복사" : "전체 코드 청크 복사"}
                    >
                      {copiedChunkId === chunk.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copiedChunkId === chunk.id ? "복사됨" : category !== "code" ? "정보 복사" : "코드 복사"}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onFindSimilar(chunk.file_path)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-sky-500/10 text-sky-400 hover:text-sky-300 transition-colors text-[11px]"
                      title="이 파일과 비슷한 파일 찾기"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>유사 파일</span>
                    </button>

                    <button
                      onClick={() => onSelectResult(res)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600/80 hover:bg-sky-500 text-white font-medium transition-colors text-[11px]"
                      title="상세 인스펙터 시트 열기"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>상세 인스펙터</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
