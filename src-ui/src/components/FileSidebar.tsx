import React, { useMemo } from "react";
import { SearchResult, isImageFile } from "../types";
import { FileCode, Cpu, BookOpen, Layers, Image as ImageIcon } from "lucide-react";

interface FileSidebarProps {
  results: SearchResult[];
  activeFilePath: string | null;
  onSelectFile: (filePath: string) => void;
}

export interface AggregatedFile {
  filePath: string;
  fileName: string;
  displayPath: string;
  ext: string;
  maxScore: number;
  chunkCount: number;
}

export const FileSidebar: React.FC<FileSidebarProps> = ({
  results,
  activeFilePath,
  onSelectFile,
}) => {
  const aggregatedFiles = useMemo(() => {
    const map = new Map<string, AggregatedFile>();

    for (const res of results) {
      const p = res.chunk.file_path;
      const existing = map.get(p);
      if (existing) {
        existing.chunkCount += 1;
        if (res.score > existing.maxScore) {
          existing.maxScore = res.score;
        }
      } else {
        map.set(p, {
          filePath: p,
          fileName: res.chunk.file_name,
          displayPath: res.chunk.display_path,
          ext: res.chunk.ext,
          maxScore: res.score,
          chunkCount: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.maxScore - a.maxScore);
  }, [results]);

  const getExtIcon = (ext: string) => {
    if (isImageFile(ext)) {
      return <ImageIcon className="w-4 h-4 text-emerald-400" />;
    }
    switch (ext.toLowerCase()) {
      case "py":
      case "ipynb":
        return <FileCode className="w-4 h-4 text-yellow-400" />;
      case "cpp":
      case "c":
      case "h":
      case "hpp":
        return <Cpu className="w-4 h-4 text-blue-400" />;
      case "md":
      case "markdown":
        return <BookOpen className="w-4 h-4 text-emerald-400" />;
      default:
        return <FileCode className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <aside className="w-72 sm:w-80 md:w-88 flex-shrink-0 flex flex-col glass-panel rounded-xl overflow-hidden border border-white/10 select-none">
      {/* Sidebar Header */}
      <div className="px-3.5 py-2.5 border-b border-white/10 bg-slate-900/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-semibold text-slate-200">검색된 파일 목록</span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
          {aggregatedFiles.length}개 파일
        </span>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {aggregatedFiles.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            검색 결과 파일이 없습니다
          </div>
        ) : (
          aggregatedFiles.map((file) => {
            const isActive = activeFilePath === file.filePath;
            const scorePct = Math.round(file.maxScore * 100);

            return (
              <div
                key={file.filePath}
                onClick={() => onSelectFile(file.filePath)}
                className={`p-2.5 rounded-lg cursor-pointer transition-all flex flex-col gap-1 border ${
                  isActive
                    ? "bg-sky-500/15 border-sky-400/40 shadow-sm"
                    : "border-transparent hover:bg-slate-800/60 hover:border-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="shrink-0">{getExtIcon(file.ext)}</div>
                    <span
                      className={`text-xs font-semibold truncate ${
                        isActive ? "text-sky-300" : "text-slate-200"
                      }`}
                      title={file.fileName}
                    >
                      {file.fileName}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                      scorePct >= 85
                        ? "text-emerald-400 bg-emerald-500/10"
                        : "text-sky-400 bg-sky-500/10"
                    }`}
                  >
                    {scorePct}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pl-6">
                  <span className="truncate max-w-[170px]" title={file.displayPath}>
                    {file.displayPath}
                  </span>
                  <span className="font-mono text-slate-500 shrink-0">
                    {file.chunkCount}개 청크
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
