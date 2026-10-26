import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../api";
import {
  Film,
  Play,
  ExternalLink,
  Copy,
  Check,
  Maximize2
} from "lucide-react";

interface VideoPreviewProps {
  filePath: string;
  fileName: string;
  ext: string;
  mode: "thumbnail" | "full";
  className?: string;
  onOpenInspector?: () => void;
  onOpenDefault?: () => void;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  filePath,
  fileName,
  ext,
  mode,
  className = "",
  onOpenInspector,
  onOpenDefault,
}) => {
  const [videoError, setVideoError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  const videoSrc = convertFileSrc(filePath);
  const isWebPlayable = ["mp4", "webm"].includes(ext.toLowerCase());

  const handleOpenPlayer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenDefault) {
      onOpenDefault();
    } else {
      api.openFileDefault(filePath);
    }
  };

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(filePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // 1. Thumbnail View (for PreviewList card)
  if (mode === "thumbnail") {
    return (
      <div
        onClick={onOpenInspector}
        className={`group relative w-full h-48 bg-slate-950/90 rounded-xl border border-white/10 overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-all hover:border-purple-500/40 hover:shadow-lg ${className}`}
        title="클릭하여 상세 인스펙터에서 비디오 확인"
      >
        {isWebPlayable && !videoError ? (
          <video
            src={videoSrc}
            preload="metadata"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onError={() => setVideoError(true)}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            muted
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-4 gap-2 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-purple-500/15 border border-purple-400/30 flex items-center justify-center text-purple-400">
              <Film className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold text-slate-300">{fileName}</span>
            <span className="text-[11px] text-slate-500 font-mono">동영상 미디어 파일</span>
          </div>
        )}

        {/* Center Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-11 h-11 rounded-full bg-slate-900/80 border border-white/20 flex items-center justify-center text-white shadow-xl backdrop-blur-xs group-hover:scale-110 transition-transform">
            <Play className="w-5 h-5 ml-0.5 text-purple-400" />
          </div>
        </div>

        {/* Top Badges */}
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 pointer-events-none">
          <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-purple-950/90 text-purple-400 border border-purple-800/60 shadow-sm backdrop-blur-xs">
            {ext}
          </span>
          {duration && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900/90 text-slate-300 border border-white/10 shadow-sm backdrop-blur-xs">
              {formatDuration(duration)}
            </span>
          )}
        </div>

        {/* Hover Action Bar */}
        <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenInspector?.();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs shadow-md transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>플레이어 열기</span>
          </button>
          <button
            onClick={handleOpenPlayer}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs border border-white/10 shadow-md transition-colors"
            title="윈도우 기본 미디어 플레이어에서 재생"
          >
            <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
            <span>미디어 플레이어</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Full Inspector View (for SheetInspector)
  return (
    <div className={`flex flex-col gap-3 w-full ${className}`}>
      {/* Video Container */}
      <div className="relative w-full rounded-xl bg-slate-950 border border-white/10 overflow-hidden shadow-inner flex flex-col">
        {/* Controls Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-white/5 text-xs text-slate-300">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold uppercase">
              {ext}
            </span>
            <span className="text-slate-300 truncate max-w-[240px]">{fileName}</span>
          </div>

          <button
            onClick={handleOpenPlayer}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            title="윈도우 기본 미디어 플레이어로 원본 재생"
          >
            <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
            <span>기본 플레이어로 재생</span>
          </button>
        </div>

        {/* Video Player Area */}
        <div className="w-full p-2 flex items-center justify-center bg-black min-h-[260px] max-h-[460px]">
          {isWebPlayable && !videoError ? (
            <video
              src={videoSrc}
              controls
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onError={() => setVideoError(true)}
              className="max-h-[440px] max-w-full rounded"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 gap-3 text-center text-slate-400">
              <div className="w-14 h-14 rounded-full bg-purple-500/15 border border-purple-400/30 flex items-center justify-center text-purple-400">
                <Film className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">{fileName}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {videoError
                    ? "웹뷰 코덱 미지원 포맷입니다. 윈도우 기본 플레이어로 재생해 주세요."
                    : `${ext.toUpperCase()} 비디오 미디어 파일`}
                </p>
              </div>
              <button
                onClick={handleOpenPlayer}
                className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition-colors shadow-md"
              >
                <Play className="w-4 h-4 ml-0.5" />
                <span>윈도우 미디어 플레이어로 재생</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metadata Detail Card */}
      <div className="p-3 rounded-xl bg-slate-950/70 border border-white/5 space-y-2 text-xs">
        <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
          <span className="text-slate-400">동영상 파일 상세 정보</span>
          <span className="font-mono text-slate-300 font-semibold">{fileName}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="bg-slate-900/60 p-2 rounded border border-white/5">
            <span className="text-slate-500 block text-[10px]">미디어 형식</span>
            <span className="text-purple-400 font-bold uppercase">{ext} 비디오</span>
          </div>

          <div className="bg-slate-900/60 p-2 rounded border border-white/5">
            <span className="text-slate-500 block text-[10px]">재생 시간</span>
            <span className="text-slate-200 font-bold">
              {duration ? formatDuration(duration) : "외부 플레이어에서 확인"}
            </span>
          </div>

          <div className="bg-slate-900/60 p-2 rounded border border-white/5 flex items-center justify-between col-span-2">
            <div className="min-w-0">
              <span className="text-slate-500 block text-[10px]">전체 경로</span>
              <span className="text-slate-200 truncate block font-mono text-[11px]" title={filePath}>
                {filePath}
              </span>
            </div>
            <button
              onClick={handleCopyPath}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors ml-2 shrink-0"
              title="전체 경로 복사"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
