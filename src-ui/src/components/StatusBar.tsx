import React, { useEffect, useState } from "react";
import { SystemStatus, IndexProgress } from "../types";
import { api } from "../api";
import { listen } from "@tauri-apps/api/event";
import { Activity, Database, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react";

interface StatusBarProps {
  onTriggerIndex: () => void;
  isIndexing: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ onTriggerIndex, isIndexing }) => {
  const [metrics, setMetrics] = useState<SystemStatus>({
    cpu_usage: 0,
    ram_usage: 0,
    is_throttled: false,
    total_chunks: 0,
  });
  const [progress, setProgress] = useState<IndexProgress | null>(null);

  useEffect(() => {
    const fetchStatus = () => {
      api.getSystemStatus()
        .then(setMetrics)
        .catch(() => {});
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    let unlistenProg: any;
    let unlistenComp: any;

    try {
      listen<IndexProgress>("index-progress", (event) => {
        setProgress(event.payload);
      }).then((un) => (unlistenProg = un));

      listen("index-complete", () => {
        setProgress(null);
        fetchStatus();
      }).then((un) => (unlistenComp = un));
    } catch {}

    return () => {
      clearInterval(interval);
      unlistenProg?.();
      unlistenComp?.();
    };
  }, []);

  return (
    <footer className="h-8 w-full border-t border-white/5 bg-slate-900/80 backdrop-blur-md px-3 flex items-center justify-between text-[11px] text-slate-400 select-none z-30">
      {/* Left: Index Status & Re-index Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onTriggerIndex}
          disabled={isIndexing}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
            isIndexing
              ? "text-sky-400 bg-sky-500/10 cursor-not-allowed"
              : "hover:bg-white/10 hover:text-slate-200 text-slate-400"
          }`}
          title="수동 색인 작업 실행"
        >
          <RefreshCw className={`w-3 h-3 ${isIndexing ? "animate-spin text-sky-400" : ""}`} />
          <span>{isIndexing ? "색인 진행 중..." : "지금 색인"}</span>
        </button>

        {progress && (
          <div className="flex items-center gap-2">
            <span className="text-sky-400 font-mono font-medium">
              {progress.percent.toFixed(0)}%
            </span>
            <span className="text-slate-500 truncate max-w-[200px]" title={progress.current_file}>
              {progress.current_file}
            </span>
            {progress.is_paused && (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                자원 점유율 초과로 일시 대기
              </span>
            )}
          </div>
        )}

        {!progress && (
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
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>원본 무훼손 안전 모드</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-slate-500" />
            <span>CPU</span>
            <span className={`font-mono ${metrics.cpu_usage > 65 ? "text-amber-400 font-bold" : "text-slate-200"}`}>
              {metrics.cpu_usage.toFixed(0)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span>RAM</span>
            <span className={`font-mono ${metrics.ram_usage > 80 ? "text-red-400 font-bold" : "text-slate-200"}`}>
              {metrics.ram_usage.toFixed(0)}%
            </span>
          </div>

          {metrics.is_throttled && (
            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/20">
              스로틀링 작동 중
            </span>
          )}
        </div>
      </div>
    </footer>
  );
};
