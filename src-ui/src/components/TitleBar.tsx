import React, { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Minus, Square, X, Layers } from "lucide-react";

interface TitleBarProps {
  onOpenSettings: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenSettings }) => {
  const [appWindow, setAppWindow] = useState<any>(null);

  useEffect(() => {
    try {
      setAppWindow(getCurrentWindow());
    } catch {
      // Running outside Tauri (browser dev)
    }
  }, []);

  const handleMinimize = () => {
    appWindow?.minimize();
  };

  const handleMaximize = async () => {
    if (await appWindow?.isMaximized()) {
      appWindow?.unmaximize();
    } else {
      appWindow?.maximize();
    }
  };

  const handleClose = async () => {
    try {
      await invoke("exit_app");
    } catch {
      appWindow?.close();
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="h-10 w-full flex items-center justify-between px-3 select-none border-b border-white/5 bg-slate-900/60 backdrop-blur-md z-50 text-slate-300 text-xs"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 font-medium tracking-wide">
        <div className="w-5 h-5 rounded-md bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 font-bold text-[10px]">
          EG2
        </div>
        <span className="font-semibold text-slate-200">eg2-rag</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          Gemma2 256d
        </span>
      </div>

      <div className="flex items-center gap-1 -mr-1">
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
          title="환경 설정 및 RAG 묶음 관리"
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMinimize}
          className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
          title="최소화"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
          title="최대화"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={handleClose}
          className="p-1.5 rounded hover:bg-red-500/80 text-slate-400 hover:text-white transition-colors"
          title="프로그램 종료"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
