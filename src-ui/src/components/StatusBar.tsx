import React, { useEffect, useState } from "react";
import { SystemStatus, IndexProgress, TargetFolder } from "../types";
import { api } from "../api";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Activity,
  Database,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Play,
  Pause,
  Square,
  ChevronDown,
  Folder,
  FolderPlus,
  Zap,
  CheckCircle2,
  Cpu
} from "lucide-react";

interface StatusBarProps {
  onIndexComplete?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({ onIndexComplete }) => {
  const [metrics, setMetrics] = useState<SystemStatus>({
    cpu_usage: 0,
    ram_usage: 0,
    is_throttled: false,
    total_chunks: 0,
  });
  const [isIndexing, setIsIndexing] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [targetFolders, setTargetFolders] = useState<TargetFolder[]>([]);
  const [isReindexMenuOpen, setIsReindexMenuOpen] = useState<boolean>(false);
  const [preferNpu, setPreferNpu] = useState<boolean>(true);

  const fetchStatus = () => {
    api.getSystemStatus()
      .then(setMetrics)
      .catch(() => {});
  };

  const loadFolders = () => {
    api.getConfig()
      .then((conf) => {
        setTargetFolders(conf.indexing?.target_paths || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    loadFolders();

    api.getNpuPreference()
      .then(setPreferNpu)
      .catch(() => {});

    api.getIndexingState()
      .then((state) => {
        setIsIndexing(state.is_running);
        setIsPaused(state.is_running ? state.is_paused : false);
      })
      .catch(() => {});

    const interval = setInterval(fetchStatus, 3000);

    let unlistenProg: any;
    let unlistenComp: any;
    let unlistenErr: any;

    try {
      listen<IndexProgress>("index-progress", (event) => {
        const p = event.payload;
        if (p.stage === "complete" || (p.stage !== "scanning" && p.stage !== "initializing" && p.total_files === 0)) {
          setIsIndexing(false);
          setIsPaused(false);
          setProgress(null);
          setStatusNote(p.current_file || "모든 파일이 최신 상태입니다 (색인 대상 0개)");
          setTimeout(() => setStatusNote(null), 4000);
          fetchStatus();
          loadFolders();
          onIndexComplete?.();
        } else {
          setIsIndexing(true);
          setIsPaused(p.is_paused);
          setProgress(p);
          setStatusNote(null);
        }
      }).then((un) => (unlistenProg = un));

      listen<number>("index-complete", (event) => {
        setIsIndexing(false);
        setIsPaused(false);
        setProgress(null);
        fetchStatus();
        loadFolders();
        onIndexComplete?.();

        const count = event.payload ?? 0;
        if (count === 0) {
          setStatusNote("모든 파일이 최신 상태입니다 (색인 대상 0개)");
        } else {
          setStatusNote(`색인 완료 (${count}개 파일 처리됨)`);
        }
        setTimeout(() => setStatusNote(null), 4000);
      }).then((un) => (unlistenComp = un));

      listen<string>("index-error", (event) => {
        setIsIndexing(false);
        setIsPaused(false);
        setProgress(null);
        setStatusNote(`오류: ${event.payload}`);
        setTimeout(() => setStatusNote(null), 6000);
      }).then((un) => (unlistenErr = un));
    } catch {}

    return () => {
      clearInterval(interval);
      unlistenProg?.();
      unlistenComp?.();
      unlistenErr?.();
    };
  }, []);

  // Fail-safe active polling every 250ms while indexing is active
  useEffect(() => {
    if (!isIndexing) return;

    const pollTimer = setInterval(async () => {
      try {
        const p = await api.getIndexingProgress();
        if (!p) return;

        if (
          p.stage === "complete" ||
          (!p.is_running && p.stage !== "scanning" && p.stage !== "initializing" && p.stage !== "indexing")
        ) {
          setIsIndexing(false);
          setIsPaused(false);
          setProgress(null);
          if (p.current_file) {
            setStatusNote(p.current_file);
            setTimeout(() => setStatusNote(null), 4000);
          }
          fetchStatus();
          loadFolders();
          onIndexComplete?.();
        } else {
          setProgress(p);
          setIsPaused(p.is_paused);
        }
      } catch {}
    }, 250);

    return () => clearInterval(pollTimer);
  }, [isIndexing]);

  // Main Toggle Button: Start / Pause / Resume
  const handleMainAction = async () => {
    setStatusNote(null);
    if (!isIndexing) {
      // Start Indexing
      setIsIndexing(true);
      setIsPaused(false);
      setProgress({
        stage: "scanning",
        current_file: "색인 대상 파일 탐색 중...",
        processed_files: 0,
        total_files: 0,
        percent: 0,
        is_paused: false,
        is_running: true,
      });
      try {
        await api.triggerIndexing();
      } catch (e: any) {
        console.error(e);
        setIsIndexing(false);
        setProgress(null);
        setStatusNote(String(e));
      }
    } else if (isPaused) {
      // Resume Indexing
      try {
        await api.resumeIndexing();
        setIsPaused(false);
      } catch (e: any) {
        console.error(e);
      }
    } else {
      // Pause Indexing
      try {
        await api.pauseIndexing();
        setIsPaused(true);
      } catch (e: any) {
        console.error(e);
      }
    }
  };

  // Cancel Indexing (Stop immediately)
  const handleCancel = async () => {
    try {
      await api.cancelIndexing();
      setIsIndexing(false);
      setIsPaused(false);
      setProgress(null);
      setStatusNote("색인 작업이 취소되었습니다.");
      setTimeout(() => setStatusNote(null), 4000);
      fetchStatus();
    } catch (e: any) {
      console.error("Cancel failed:", e);
    }
  };

  // Force Re-index All Folders (with NPU verification)
  const handleReindexAll = async () => {
    setIsReindexMenuOpen(false);
    setStatusNote(null);
    setIsIndexing(true);
    setIsPaused(false);
    setProgress({
      stage: "initializing",
      current_file: "기존 색인 데이터 초기화 중...",
      processed_files: 0,
      total_files: 0,
      percent: 0,
      is_paused: false,
      is_running: true,
    });

    try {
      await api.triggerIndexing(undefined, true);
    } catch (e: any) {
      console.error(e);
      setIsIndexing(false);
      setProgress(null);
      setStatusNote(`다시 색인 실패: ${e}`);
    }
  };

  // Force Re-index Specific Folder
  const handleReindexFolder = async (folderPath: string) => {
    setIsReindexMenuOpen(false);
    setStatusNote(null);
    setIsIndexing(true);
    setIsPaused(false);
    setProgress({
      stage: "initializing",
      current_file: `[${folderPath}] 대상 탐색 중...`,
      processed_files: 0,
      total_files: 0,
      percent: 0,
      is_paused: false,
      is_running: true,
    });

    try {
      await api.triggerIndexing(folderPath, true);
    } catch (e: any) {
      console.error(e);
      setIsIndexing(false);
      setProgress(null);
      setStatusNote(`다시 색인 실패: ${e}`);
    }
  };

  // Pick Custom Folder from Explorer & Re-index (Supports Multiple Selection)
  const handlePickAndReindex = async () => {
    setIsReindexMenuOpen(false);
    try {
      const selected = await open({
        directory: true,
        multiple: true,
        title: "다시 색인할 폴더 또는 드라이브 선택 (복수 선택 가능)",
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        for (const p of paths) {
          await handleReindexFolder(p);
        }
      }
    } catch (e) {
      console.error("Folder pick error:", e);
    }
  };

  return (
    <footer className="h-9 w-full border-t border-white/5 bg-slate-900/90 backdrop-blur-md px-3 flex items-center justify-between text-[11px] text-slate-400 select-none z-30 relative">
      {/* Popover Backdrop when dropdown is open */}
      {isReindexMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsReindexMenuOpen(false)}
        />
      )}

      {/* Left: Unified Index Controls, Progress & Status */}
      <div className="flex items-center gap-2 relative z-50">
        {/* 1. Main Index State & Action Button */}
        {!isIndexing ? (
          <button
            onClick={handleMainAction}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium transition-all active:scale-95 shadow-sm text-xs"
            title="색인 생성 시작 (새 파일 및 변경 파일 색인)"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>색인</span>
          </button>
        ) : isPaused ? (
          <button
            onClick={handleMainAction}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 font-medium transition-all active:scale-95 text-xs"
            title="일시 정지된 색인 재개"
          >
            <Play className="w-3 h-3 fill-current text-amber-400" />
            <span>색인 재개</span>
          </button>
        ) : (
          <button
            onClick={handleMainAction}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/30 font-medium transition-all active:scale-95 text-xs"
            title="색인 일시 정지"
          >
            <Pause className="w-3 h-3 fill-current text-sky-400" />
            <span>일시 정지</span>
          </button>
        )}

        {/* 2. Cancel Indexing Button (Visible whenever indexing is active) */}
        {isIndexing && (
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-medium transition-all active:scale-95 text-xs"
            title="진행 중인 색인 작업을 즉시 중단 및 취소"
          >
            <Square className="w-3 h-3 fill-current text-rose-400" />
            <span>색인 취소</span>
          </button>
        )}

        {/* 3. Re-index Button with Dropdown (다시 색인하기) */}
        <div className="relative">
          <button
            onClick={() => {
              loadFolders();
              setIsReindexMenuOpen(!isReindexMenuOpen);
            }}
            disabled={isIndexing}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all border ${
              isIndexing
                ? "opacity-40 cursor-not-allowed bg-slate-800 text-slate-500 border-transparent"
                : isReindexMenuOpen
                ? "bg-slate-700 text-slate-100 border-sky-400/40"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10 hover:text-white active:scale-95"
            }`}
            title="기존 캐시를 무시하고 Intel AI Boost NPU로 다시 색인"
          >
            <RefreshCw className="w-3 h-3 text-sky-400" />
            <span>다시 색인</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${isReindexMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Re-index Menu Popover */}
          {isReindexMenuOpen && (
            <div className="absolute bottom-full mb-2 left-0 w-72 bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl p-2 z-50 text-xs backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="px-2 py-1.5 border-b border-white/5 mb-1.5">
                <div className="font-semibold text-slate-200 flex items-center gap-1.5 text-[11px]">
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span>다시 색인 (Intel AI Boost NPU 가속)</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  기존 해시를 무시하고 NPU 하드웨어 가속기로 텍스트 임베딩을 처음부터 다시 생성합니다.
                </div>
              </div>

              {/* Option 1: Re-index All Folders */}
              <button
                onClick={handleReindexAll}
                className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-sky-500/20 text-slate-200 hover:text-sky-300 transition-colors flex flex-col gap-0.5 group"
              >
                <div className="flex items-center gap-1.5 font-medium text-[11px]">
                  <RefreshCw className="w-3 h-3 text-sky-400 group-hover:rotate-180 transition-transform duration-300" />
                  <span>전체 다시 색인 (모든 폴더)</span>
                </div>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-300 pl-4.5">
                  등록된 모든 대상 폴더의 색인 초기화 후 NPU 재생성
                </span>
              </button>

              {/* Divider & Header */}
              <div className="my-1.5 border-t border-white/5 pt-1.5 px-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                특정 폴더만 다시 색인
              </div>

              {/* Option 2: Configured Target Folders */}
              <div className="max-h-36 overflow-y-auto space-y-0.5">
                {targetFolders.length === 0 ? (
                  <div className="text-[10px] text-slate-500 px-2 py-1">
                    등록된 대상 폴더가 없습니다.
                  </div>
                ) : (
                  targetFolders.map((tf, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleReindexFolder(tf.path)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors flex items-center gap-2 truncate group"
                      title={tf.path}
                    >
                      <Folder className="w-3 h-3 text-sky-400/80 group-hover:text-sky-300 shrink-0" />
                      <div className="truncate flex-1">
                        <span className="font-medium text-[11px] text-slate-200">{tf.name || "대상 폴더"}</span>
                        <span className="text-[10px] text-slate-400 block truncate font-mono">{tf.path}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Option 3: Pick other folder */}
              <button
                onClick={handlePickAndReindex}
                className="w-full text-left mt-1.5 pt-1.5 border-t border-white/5 px-2.5 py-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-sky-300 transition-colors flex items-center gap-2"
              >
                <FolderPlus className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="font-medium text-[11px]">새 폴더 선택 후 다시 색인...</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. Real-time Progress Display (Always visible during indexing) */}
        {isIndexing && (
          <div className="flex items-center gap-2 bg-slate-950/70 px-2.5 py-0.5 rounded border border-white/10 text-xs">
            {progress?.stage === "scanning" ? (
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />
                <span className="text-[11px] font-medium text-sky-300">
                  {progress.current_file || "색인 대상 파일 탐색 중..."}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30 animate-pulse">
                  탐색 중
                </span>
              </div>
            ) : progress?.stage === "initializing" ? (
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-[11px] font-medium text-amber-300">
                  {progress.current_file || "기존 색인 데이터 초기화 중..."}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
                  초기화 중
                </span>
              </div>
            ) : (
              <>
                <span
                  className={`font-mono font-bold text-xs ${
                    isPaused ? "text-amber-400" : "text-sky-400"
                  }`}
                >
                  {(progress?.percent ?? 0).toFixed(0)}%
                </span>

                {/* Mini Progress Bar */}
                <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isPaused ? "bg-amber-400" : "bg-sky-400"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, progress?.percent ?? 0))}%` }}
                  />
                </div>

                {/* File Count */}
                <span className="font-mono text-slate-300 text-[11px] whitespace-nowrap">
                  <strong className="text-white font-semibold">{progress?.processed_files ?? 0}</strong>
                  /{progress?.total_files ?? 0} 파일
                </span>

                {/* Status Pill */}
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${
                    isPaused
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "bg-sky-500/15 text-sky-400 border border-sky-500/30 animate-pulse"
                  }`}
                >
                  {isPaused ? "일시정지됨" : "색인 중"}
                </span>

                {/* NPU Badge during indexing */}
                {preferNpu && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 font-mono font-bold flex items-center gap-0.5">
                    <Cpu className="w-2.5 h-2.5 text-sky-400" />
                    NPU
                  </span>
                )}

                {/* Truncated File Name */}
                <span
                  className="text-[10px] text-slate-400 font-mono truncate max-w-[140px] hidden sm:inline"
                  title={progress?.current_file || "색인 처리 중..."}
                >
                  ({progress?.current_file || "색인 처리 중..."})
                </span>
              </>
            )}
          </div>
        )}

        {/* Status Notification Note (e.g. Cancelled, 0 files or completion) */}
        {!isIndexing && statusNote && (
          <div className="flex items-center gap-1.5 text-sky-300 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded text-[11px] animate-in fade-in duration-200">
            <CheckCircle2 className="w-3 h-3 text-sky-400" />
            <span>{statusNote}</span>
          </div>
        )}

        {/* Chunk Count when idle */}
        {!isIndexing && !statusNote && (
          <div className="flex items-center gap-1.5 text-slate-400">
            <Database className="w-3 h-3 text-sky-400" />
            <span>색인 청크:</span>
            <span className="font-mono text-slate-200 font-medium">
              {metrics.total_chunks.toLocaleString()}개
            </span>
          </div>
        )}
      </div>

      {/* Right: Resource Metrics & Safety Guarantee */}
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-1 text-emerald-400/90 text-[10px]">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>안전 모드: 원본 보호 (Read-Only)</span>
        </div>

        {/* Governor Indicator */}
        <div className="flex items-center gap-1.5">
          {metrics.is_throttled ? (
            <div className="flex items-center gap-1 text-amber-400 animate-pulse" title="CPU/RAM 점유율 한도 초과로 자원 조절 활성화">
              <AlertTriangle className="w-3 h-3" />
              <span>자원 조절 중</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-slate-400">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>정상</span>
            </div>
          )}
        </div>

        {/* CPU & RAM Usage */}
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-slate-400">
            CPU <strong className="text-slate-200">{metrics.cpu_usage}%</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">
            RAM <strong className="text-slate-200">{metrics.ram_usage}%</strong>
          </span>
        </div>
      </div>
    </footer>
  );
};
