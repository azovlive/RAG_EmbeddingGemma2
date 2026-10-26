import React from "react";
import { KnowledgeBundle } from "../types";
import { Code, FileCode, BookOpen, Layers, Plus, Image as ImageIcon, Video } from "lucide-react";

interface BundleSelectorProps {
  bundles: KnowledgeBundle[];
  selectedBundleId: string;
  onSelectBundle: (id: string) => void;
  onAddBundle: () => void;
}

export const BundleSelector: React.FC<BundleSelectorProps> = ({
  bundles,
  selectedBundleId,
  onSelectBundle,
  onAddBundle,
}) => {
  const getIcon = (preset: string) => {
    switch (preset) {
      case "python":
        return <FileCode className="w-3.5 h-3.5 text-yellow-400" />;
      case "cpp":
        return <Code className="w-3.5 h-3.5 text-blue-400" />;
      case "markdown":
        return <BookOpen className="w-3.5 h-3.5 text-emerald-400" />;
      case "image":
        return <ImageIcon className="w-3.5 h-3.5 text-rose-400" />;
      case "video":
        return <Video className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-sky-400" />;
    }
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 scrollbar-none">
      <button
        onClick={() => onSelectBundle("all")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          selectedBundleId === "all"
            ? "bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow-sm"
            : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
        }`}
      >
        <Layers className="w-3.5 h-3.5" />
        <span>전체 대상</span>
      </button>

      {bundles.map((bundle) => {
        const isSelected = selectedBundleId === bundle.id;
        return (
          <button
            key={bundle.id}
            onClick={() => onSelectBundle(bundle.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              isSelected
                ? "bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
            }`}
          >
            {getIcon(bundle.preset)}
            <span>{bundle.name}</span>
            {bundle.extensions.length > 0 && (
              <span className="text-[10px] text-slate-500 px-1 py-0.2 rounded bg-slate-800/80">
                .{bundle.extensions[0]}
              </span>
            )}
          </button>
        );
      })}

      <button
        onClick={onAddBundle}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-dashed border-white/10 transition-colors"
        title="새 RAG 묶음 만들기"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>새 묶음</span>
      </button>
    </div>
  );
};
