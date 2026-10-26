import React, { useEffect, useState } from "react";
import { ImageDataResponse } from "../types";
import { api } from "../api";
import {
  Image as ImageIcon,
  ExternalLink,
  Copy,
  Check,
  Maximize2,
  ZoomIn,
  ZoomOut,
  AlertCircle
} from "lucide-react";

interface ImagePreviewProps {
  filePath: string;
  fileName: string;
  ext: string;
  mode: "thumbnail" | "full";
  className?: string;
  onOpenInspector?: () => void;
  onOpenDefault?: () => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  filePath,
  fileName,
  ext,
  mode,
  className = "",
  onOpenInspector,
  onOpenDefault,
}) => {
  const [data, setData] = useState<ImageDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDimensions(null);

    api.getImageData(filePath)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(typeof err === "string" ? err : "이미지를 불러오지 못했습니다.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
  };

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(filePath);
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

  if (loading) {
    return (
      <div
        className={`w-full flex flex-col items-center justify-center bg-slate-950/60 rounded-xl border border-white/5 py-8 gap-2 text-slate-400 ${
          mode === "thumbnail" ? "h-44" : "h-72"
        } ${className}`}
      >
        <ImageIcon className="w-8 h-8 text-sky-400 animate-pulse" />
        <span className="text-xs font-mono">이미지 불러오는 중...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className={`w-full flex flex-col items-center justify-center bg-slate-950/60 rounded-xl border border-rose-500/20 py-6 gap-2 text-rose-400 ${
          mode === "thumbnail" ? "h-36" : "h-64"
        } ${className}`}
      >
        <AlertCircle className="w-7 h-7 text-rose-400" />
        <div className="text-center px-4">
          <p className="text-xs font-semibold">{fileName}</p>
          <p className="text-[11px] text-slate-400 mt-1">{error || "이미지를 표시할 수 없습니다."}</p>
        </div>
        <button
          onClick={handleOpenDefaultApp}
          className="mt-1 flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:text-white text-xs border border-white/10"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>기본 뷰어로 직접 열기</span>
        </button>
      </div>
    );
  }

  // 1. Thumbnail View (for PreviewList card)
  if (mode === "thumbnail") {
    return (
      <div
        onClick={onOpenInspector}
        className={`group relative w-full h-48 bg-slate-950/80 rounded-xl border border-white/10 overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-all hover:border-sky-500/40 hover:shadow-lg ${className}`}
        title="클릭하여 상세 인스펙터에서 큰 이미지 보기"
      >
        {/* Transparent grid background for PNGs */}
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:12px_12px]" />

        {/* Thumbnail Image */}
        <div className="w-full h-full p-2 flex items-center justify-center relative z-10">
          <img
            src={data.data_url}
            alt={fileName}
            onLoad={handleImageLoad}
            className="max-h-full max-w-full object-contain rounded transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy"
          />
        </div>

        {/* Floating Top Badge: Format & Dimensions */}
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 pointer-events-none">
          <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-sky-950/90 text-sky-400 border border-sky-800/60 shadow-sm backdrop-blur-xs">
            {ext || data.ext}
          </span>
          {dimensions && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900/90 text-slate-300 border border-white/10 shadow-sm backdrop-blur-xs">
              {dimensions.width} × {dimensions.height}
            </span>
          )}
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900/90 text-slate-400 border border-white/10 shadow-sm backdrop-blur-xs">
            {data.formatted_size}
          </span>
        </div>

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenInspector?.();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-md transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>크게 보기</span>
          </button>
          <button
            onClick={handleOpenDefaultApp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs border border-white/10 shadow-md transition-colors"
            title="윈도우 사진 앱에서 열기"
          >
            <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
            <span>사진 앱</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Full Inspector View (for SheetInspector)
  return (
    <div className={`flex flex-col gap-3 w-full ${className}`}>
      {/* Image Container with Fit/1:1 toggle */}
      <div className="relative w-full rounded-xl bg-slate-950 border border-white/10 overflow-hidden shadow-inner flex flex-col">
        {/* Controls Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-white/5 text-xs text-slate-300">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold uppercase">
              {data.ext || ext}
            </span>
            {dimensions && (
              <span className="text-slate-300">
                {dimensions.width} × {dimensions.height} px
              </span>
            )}
            <span className="text-slate-400">({data.formatted_size})</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsZoomed(!isZoomed)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                isZoomed
                  ? "bg-sky-500 text-slate-950 font-bold"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300"
              }`}
              title={isZoomed ? "화면 맞춤으로 전환" : "원본 100% 크기로 확대"}
            >
              {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
              <span>{isZoomed ? "화면 맞춤" : "1:1 원본"}</span>
            </button>

            <button
              onClick={handleOpenDefaultApp}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              title="윈도우 기본 사진 앱으로 원본 보기"
            >
              <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
              <span>사진 앱</span>
            </button>
          </div>
        </div>

        {/* Viewport Area */}
        <div
          className={`w-full p-3 flex items-center justify-center bg-slate-950/90 relative ${
            isZoomed ? "max-h-[640px] overflow-auto" : "max-h-[500px] overflow-hidden"
          }`}
          style={{ minHeight: "260px" }}
        >
          {/* Subtle grid pattern for transparency */}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

          <img
            src={data.data_url}
            alt={fileName}
            onLoad={handleImageLoad}
            className={`transition-all duration-150 rounded ${
              isZoomed
                ? "max-w-none object-none cursor-grab active:cursor-grabbing"
                : "max-h-[460px] max-w-full object-contain cursor-zoom-in"
            }`}
            onClick={() => setIsZoomed(!isZoomed)}
            title={isZoomed ? "클릭하여 화면 맞춤" : "클릭하여 1:1 확대"}
          />
        </div>
      </div>

      {/* Metadata Detail Card */}
      <div className="p-3 rounded-xl bg-slate-950/70 border border-white/5 space-y-2 text-xs">
        <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
          <span className="text-slate-400">이미지 상세 정보</span>
          <span className="font-mono text-slate-300 font-semibold">{fileName}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="bg-slate-900/60 p-2 rounded border border-white/5">
            <span className="text-slate-500 block text-[10px]">해상도</span>
            <span className="text-slate-200 font-bold">
              {dimensions ? `${dimensions.width} × ${dimensions.height} px` : "계산 중..."}
            </span>
          </div>

          <div className="bg-slate-900/60 p-2 rounded border border-white/5">
            <span className="text-slate-500 block text-[10px]">파일 크기</span>
            <span className="text-slate-200 font-bold">{data.formatted_size}</span>
          </div>

          <div className="bg-slate-900/60 p-2 rounded border border-white/5">
            <span className="text-slate-500 block text-[10px]">MIME 형식</span>
            <span className="text-slate-200">{data.mime_type}</span>
          </div>

          <div className="bg-slate-900/60 p-2 rounded border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-slate-500 block text-[10px]">전체 경로</span>
              <span className="text-slate-200 truncate max-w-[140px] block" title={filePath}>
                {fileName}
              </span>
            </div>
            <button
              onClick={handleCopyPath}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors ml-1 shrink-0"
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
