import React, { useState } from "react";
import { api } from "../api";
import {
  FileText,
  BookOpen,
  ExternalLink,
  Copy,
  Check,
  Maximize2,
  FileSpreadsheet,
  Presentation,
  FileCode
} from "lucide-react";

interface DocumentPreviewProps {
  filePath: string;
  fileName: string;
  ext: string;
  content: string;
  startLine: number;
  endLine: number;
  mode: "thumbnail" | "full";
  className?: string;
  onOpenInspector?: () => void;
  onOpenDefault?: () => void;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  filePath,
  fileName,
  ext,
  content,
  startLine,
  endLine,
  mode,
  className = "",
  onOpenInspector,
  onOpenDefault,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewSource, setViewSource] = useState(false);

  const cleanExt = ext.toLowerCase().replace(/^\./, "");
  const isPdf = cleanExt === "pdf";
  const isMarkdown = ["md", "markdown"].includes(cleanExt);
  const isSpreadsheet = ["xls", "xlsx", "csv"].includes(cleanExt);
  const isPresentation = ["ppt", "pptx"].includes(cleanExt);
  const isOfficeDoc = ["doc", "docx", "hwp", "hwpx"].includes(cleanExt);

  const handleCopyText = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenDefaultApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenDefault) {
      onOpenDefault();
    } else {
      api.openFileDefault(filePath);
    }
  };

  const getDocIcon = () => {
    if (isPdf) return <BookOpen className="w-4 h-4 text-rose-400" />;
    if (isMarkdown) return <FileText className="w-4 h-4 text-emerald-400" />;
    if (isSpreadsheet) return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
    if (isPresentation) return <Presentation className="w-4 h-4 text-orange-400" />;
    if (isOfficeDoc) return <FileText className="w-4 h-4 text-blue-400" />;
    return <FileText className="w-4 h-4 text-amber-400" />;
  };

  const getBadgeColor = () => {
    if (isPdf) return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    if (isMarkdown) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (isSpreadsheet) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
    if (isPresentation) return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    if (isOfficeDoc) return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  };

  // Render markdown or text with formatted document styling
  const renderFormattedLines = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-xs font-bold text-sky-300 mt-2 mb-1">
            {trimmed.slice(4)}
          </h4>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h3 key={idx} className="text-sm font-bold text-sky-200 mt-2.5 mb-1 border-b border-white/5 pb-0.5">
            {trimmed.slice(3)}
          </h3>
        );
      }
      if (trimmed.startsWith("# ")) {
        return (
          <h2 key={idx} className="text-sm font-bold text-white mt-3 mb-1 border-b border-white/10 pb-1">
            {trimmed.slice(2)}
          </h2>
        );
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        return (
          <li key={idx} className="ml-4 list-disc text-slate-300 text-xs py-0.5">
            {trimmed.slice(2)}
          </li>
        );
      }
      if (trimmed.startsWith("> ")) {
        return (
          <blockquote key={idx} className="pl-2 border-l-2 border-sky-400/50 text-slate-400 italic text-xs my-1 bg-white/5 py-1 rounded-r">
            {trimmed.slice(2)}
          </blockquote>
        );
      }
      if (!trimmed) {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p key={idx} className="text-xs text-slate-300 leading-relaxed font-sans select-text">
          {line}
        </p>
      );
    });
  };

  // 1. Thumbnail / Compact Card View (for PreviewList)
  if (mode === "thumbnail") {
    const allLines = content.split("\n");
    const previewLines = allLines.slice(0, 7);
    const hasMore = allLines.length > 7;

    return (
      <div className={`flex flex-col gap-2 rounded-xl bg-slate-900/60 border border-white/10 p-3 relative ${className}`}>
        {/* Document Header Tag */}
        <div className="flex items-center justify-between text-xs pb-1.5 border-b border-white/5">
          <div className="flex items-center gap-1.5 font-medium min-w-0">
            {getDocIcon()}
            <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${getBadgeColor()}`}>
              {cleanExt} {isPdf ? "PDF" : isMarkdown ? "마크다운" : "문서"}
            </span>
            <span className="text-[11px] text-slate-300 truncate max-w-[200px]" title={fileName}>
              {fileName}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              ({isPdf ? `Page ${startLine}` : `L${startLine}-${endLine}`})
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopyText}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="문서 본문 텍스트 복사"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Paper-styled Document Content Container */}
        <div className="bg-slate-950/70 rounded-lg p-3 border border-white/5 text-xs text-slate-200 overflow-hidden relative">
          <div className="space-y-1">
            {isMarkdown ? (
              renderFormattedLines(previewLines.join("\n"))
            ) : (
              <p className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap select-text">
                {previewLines.join("\n")}
              </p>
            )}
          </div>

          {hasMore && (
            <div className="pt-2 text-[10px] text-slate-500 italic flex justify-between items-center border-t border-white/5 mt-2">
              <span>... 외 {allLines.length - 7}줄 더 있음</span>
              <button
                onClick={onOpenInspector}
                className="text-sky-400 hover:underline flex items-center gap-1"
              >
                <Maximize2 className="w-3 h-3" />
                <span>문서 전체 펼쳐보기</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. Full Inspector View (for SheetInspector)
  return (
    <div className={`flex flex-col gap-3 w-full ${className}`}>
      {/* Document Reader Container */}
      <div className="relative w-full rounded-xl bg-slate-950 border border-white/10 overflow-hidden shadow-inner flex flex-col">
        {/* Controls Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-white/5 text-xs text-slate-300">
          <div className="flex items-center gap-2 min-w-0">
            {getDocIcon()}
            <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${getBadgeColor()}`}>
              {cleanExt}
            </span>
            <span className="text-slate-200 font-semibold truncate max-w-[200px]" title={fileName}>
              {fileName}
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              ({isPdf ? `페이지 ${startLine}` : `라인 ${startLine} - ${endLine}`})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isMarkdown && (
              <button
                onClick={() => setViewSource(!viewSource)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                  viewSource
                    ? "bg-sky-500 text-slate-950 font-bold"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{viewSource ? "서식 보기" : "소스 코드"}</span>
              </button>
            )}

            <button
              onClick={handleOpenDefaultApp}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-colors shadow-sm"
              title="기본 전용 앱(Edge, Word, Acrobat 등)으로 원본 열기"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{isPdf ? "PDF 뷰어로 열기" : isOfficeDoc ? "오피스 앱으로 열기" : "기본 앱으로 열기"}</span>
            </button>
          </div>
        </div>

        {/* Document Content Viewport */}
        <div className="p-4 max-h-[500px] overflow-y-auto bg-slate-950/90 space-y-2">
          {viewSource ? (
            <pre className="p-3 rounded-lg bg-slate-900/80 border border-white/5 text-xs font-mono text-slate-200 whitespace-pre-wrap select-text">
              {content}
            </pre>
          ) : isMarkdown ? (
            <div className="prose prose-invert max-w-none space-y-1.5">
              {renderFormattedLines(content)}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-slate-900/60 border border-white/5">
              <p className="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap select-text">
                {content}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
