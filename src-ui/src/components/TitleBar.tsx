import React, { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Minus,
  Square,
  X,
  Layers,
  Play,
  Pause,
  CheckCircle2
} from "lucide-react";
import { api } from "../api";
import { IndexProgress } from "../types";

interface TitleBarProps {
  onOpenSettings: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenSettings }) => {
  const [appWindow, setAppWindow] = useState<any>(null);
  const [isIndexing, setIsIndexing] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [totalChunks, setTotalChunks] = useState<number>(0);

  useEffect(() => {
    try {
      setAppWindow(getCurrentWindow());
    } catch {}

    const refreshState = () => {
      api.getIndexingState()
        .then((state) => {
          setIsIndexing(state.is_running);
          setIsPaused(state.is_paused);
          setTotalChunks(state.total_chunks);
        })
        .catch(() => {});
    };

    refreshState();
    const interval = setInterval(refreshState, 2000);

    let unlistenProg: any;
    let unlistenComp: any;

    try {
      listen<IndexProgress>("index-progress", (event) => {
        setIsIndexing(true);
        setIsPaused(event.payload.is_paused);
        setProgress(event.payload);
      }).then((un) => (unlistenProg = un));

      listen("index-complete", () => {
        setIsIndexing(false);
        setIsPaused(false);
        setProgress(null);
        refreshState();
      }).then((un) => (unlistenComp = un));
    } catch {}

    return () => {
      clearInterval(interval);
      unlistenProg?.();
      unlistenComp?.();
    };
  }, []);

  const handleStart = async () => {
    setIsIndexing(true);
    setIsPaused(false);
    try {
      await api.triggerIndexing();
    } catch (e) {
      console.error(e);
      setIsIndexing(false);
    }
  };

  const handlePause = async () => {
    try {
      await api.pauseIndexing();
      setIsPaused(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResume = async () => {
    try {
      await api.resumeIndexing();
      setIsPaused(false);
    } catch (e) {
      console.error(e);
    }
  };

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
      className="h-10 w-full flex items-center justify-between px-3 select-none border-b border-white/5 bg-slate-900/80 backdrop-blur-md z-50 text-slate-300 text-xs"
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

      {/* Center: Indexing Controls, Progress Rate & File Count in Menu Bar */}
      <div data-tauri-drag-region className="flex items-center gap-3 max-w-xl mx-2">
        {/* Action Button: Start / Pause / Resume */}
        {!isIndexing ? (
          <button
            onClick={handleStart}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-600/80 hover:bg-sky-500 text-white font-medium transition-all shadow-sm active:scale-95 text-xs"
            title="색인 생성 시작"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>색인 시작</span>
          </button>
        ) : isPaused ? (
          <button
            onClick={handleResume}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/30 font-medium transition-all active:scale-95 text-xs"
            title="일시 정지된 색인 재개"
          >
            <Play className="w-3 h-3 fill-current text-sky-400" />
            <span>색인 재개</span>
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 font-medium transition-all active:scale-95 text-xs"
            title="색인 일시 정지"
          >
            <Pause className="w-3 h-3 fill-current text-amber-400" />
            <span>일시 정지</span>
          </button>
        )}

        {/* Progress Display: Rate %, File Count & Indicator */}
        {isIndexing ? (
          <div className="flex items-center gap-2 bg-slate-950/60 px-2.5 py-1 rounded-lg border border-white/10 text-xs">
            <span
              className={`font-mono font-bold text-xs ${
                isPaused ? "text-amber-400" : "text-sky-400"
              }`}
            >
              {(progress?.percent ?? 0).toFixed(0)}%
            </span>

            {/* Mini Progress Bar */}
            <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
              <div
                className={`h-full transition-all duration-300 ${
                  isPaused ? "bg-amber-400" : "bg-sky-400"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progress?.percent ?? 0))}%` }}
              />
            </div>

            {/* File Count Display (색인 파일수) */}
            <span className="font-mono text-slate-300 text-[11px] whitespace-nowrap">
              <strong className="text-white font-semibold">
                {progress?.processed_files ?? 0}
              </strong>
              /{progress?.total_files ?? 0} 파일
            </span>

            {/* Status Pill */}
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                isPaused
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "bg-sky-500/15 text-sky-400 border border-sky-500/30 animate-pulse"
              }`}
            >
              {isPaused ? "일시정지됨" : "색인 중"}
            </span>

            {/* Truncated File Name */}
            {progress?.current_file && (
              <span
                className="text-[10px] text-slate-400 font-mono truncate max-w-[120px] hidden sm:inline"
                title={progress.current_file}
              >
                ({progress.current_file})
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>색인 완료:</span>
            <span className="font-mono text-slate-200 font-semibold">
              {totalChunks.toLocaleString()}개 청크
            </span>
          </div>
        )}
      </div>

      {/* Right: Window Controls & Settings */}
      <div className="flex items-center gap-1 -mr-1 shrink-0">
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
