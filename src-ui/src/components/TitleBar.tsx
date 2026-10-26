import React, { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
  Minus,
  Square,
  X,
  Layers,
  Cpu
} from "lucide-react";
import { api } from "../api";

interface TitleBarProps {
  onOpenSettings: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenSettings }) => {
  const [appWindow, setAppWindow] = useState<any>(null);
  const [preferNpu, setPreferNpu] = useState<boolean>(true);

  useEffect(() => {
    try {
      setAppWindow(getCurrentWindow());
    } catch {}

    api.getNpuPreference()
      .then(setPreferNpu)
      .catch(() => {});
  }, []);

  const handleToggleNpu = async () => {
    const nextState = !preferNpu;
    try {
      await api.setNpuPreference(nextState);
      setPreferNpu(nextState);
    } catch (e) {
      console.error(e);
    }
  };

  const handleMinimize = async () => {
    try {
      await invoke("minimize_window");
    } catch {
      appWindow?.minimize();
    }
  };

  const handleMaximize = async () => {
    try {
      await invoke("toggle_maximize_window");
    } catch {
      if (await appWindow?.isMaximized()) {
        appWindow?.unmaximize();
      } else {
        appWindow?.maximize();
      }
    }
  };

  const handleStartDrag = async (e: React.MouseEvent) => {
    if (e.buttons === 1) {
      try {
        await invoke("start_dragging_window");
      } catch {
        appWindow?.startDragging();
      }
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
      onMouseDown={handleStartDrag}
      onDoubleClick={handleMaximize}
      className="h-10 w-full flex items-center justify-between px-3 select-none border-b border-white/5 bg-slate-900/80 backdrop-blur-md z-50 text-slate-300 text-xs cursor-default"
    >
      {/* Left: App Logo & Name */}
      <div data-tauri-drag-region className="flex items-center gap-2 font-medium tracking-wide shrink-0">
        <div className="w-5 h-5 rounded-md bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 font-bold text-[10px]">
          EG2
        </div>
        <span className="font-semibold text-slate-200">eg2-rag</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          Gemma2 256d
        </span>
      </div>

      {/* Center Drag Region */}
      <div data-tauri-drag-region onMouseDown={handleStartDrag} className="flex-1 h-full mx-4" />

      {/* Right: NPU Toggle & Window Controls */}
      <div
        className="flex items-center gap-1.5 -mr-1 shrink-0 z-10"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {/* NPU Prefer Toggle Button */}
        <button
          onClick={handleToggleNpu}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
            preferNpu
              ? "bg-sky-500/15 text-sky-300 border-sky-400/40 shadow-sm"
              : "bg-slate-800 text-slate-400 border-white/5 hover:bg-slate-700 hover:text-slate-200"
          }`}
          title={
            preferNpu
              ? "Intel AI Boost NPU 초저전력 가속 활성화됨 (< 3W 전력, CPU 간섭 0%)"
              : "NPU 가속 비활성화됨 (클릭하여 NPU 우선 사용 활성화)"
          }
        >
          <Cpu className={`w-3.5 h-3.5 ${preferNpu ? "text-sky-400" : "text-slate-500"}`} />
          <span className="font-semibold text-[11px]">NPU 우선</span>
          <span
            className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold ${
              preferNpu ? "bg-sky-400 text-slate-950" : "bg-slate-700 text-slate-400"
            }`}
          >
            {preferNpu ? "ON" : "OFF"}
          </span>
        </button>

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
