import React, { useState, useEffect } from "react";
import { AppConfig, DriveInfo, FolderAddInput, IndexProgress, KnowledgeBundle, TargetFolderStatus, TargetProcessReport } from "../types";
import { api } from "../api";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  X,
  Folder,
  FolderPlus,
  HardDrive,
  Plus,
  Trash2,
  Check,
  ShieldCheck,
  Layers,
  Settings,
  Cpu,
  AlertTriangle,
  Info,
  CheckCircle2,
  AlertCircle,
  FolderTree,
  Zap,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

interface WizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInitialSetup?: boolean;
}

export const WizardModal: React.FC<WizardModalProps> = ({
  isOpen,
  onClose,
  isInitialSetup = false,
}) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState<"paths" | "bundles" | "governor">("paths");
  const [targetFolders, setTargetFolders] = useState<TargetFolderStatus[]>([]);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [showDrivePicker, setShowDrivePicker] = useState<boolean>(false);
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [multiPathInput, setMultiPathInput] = useState<string>("");
  const [processReport, setProcessReport] = useState<TargetProcessReport | null>(null);
  const [showAdvancedStorage, setShowAdvancedStorage] = useState<boolean>(false);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);

  const [newBundleName, setNewBundleName] = useState("");
  const [newBundlePreset, setNewBundlePreset] = useState("python");
  const [newBundleExts, setNewBundleExts] = useState("py, ipynb");
  const [savedSuccess, setSavedSuccess] = useState(false);

  const loadFolderStatuses = () => {
    api.getTargetFoldersStatus()
      .then(setTargetFolders)
      .catch((err) => console.error("대상 폴더 상태 조회 실패:", err));
  };

  const loadDrives = () => {
    api.getAvailableDrives()
      .then(setDrives)
      .catch((err) => console.error("드라이브 목록 조회 실패:", err));
  };

  useEffect(() => {
    if (!isOpen) return;

    api.getConfig().then(setConfig).catch(console.error);
    loadFolderStatuses();
    loadDrives();

    let unlistenProg: any;
    let unlistenComp: any;
    let unlistenErr: any;

    try {
      listen<IndexProgress>("index-progress", (event) => {
        const p = event.payload;
        if (p.stage === "complete" || (!p.is_running && p.stage !== "scanning" && p.stage !== "initializing" && p.stage !== "indexing")) {
          setIndexProgress(null);
          loadFolderStatuses();
          loadDrives();
        } else {
          setIndexProgress(p);
          loadFolderStatuses();
        }
      }).then((un) => (unlistenProg = un));

      listen<number>("index-complete", () => {
        setIndexProgress(null);
        loadFolderStatuses();
        loadDrives();
      }).then((un) => (unlistenComp = un));

      listen<string>("index-error", () => {
        setIndexProgress(null);
        loadFolderStatuses();
        loadDrives();
      }).then((un) => (unlistenErr = un));
    } catch {}

    // Active polling while modal is open so status transitions in real time without lag
    const pollInterval = setInterval(() => {
      loadFolderStatuses();
      api.getIndexingProgress()
        .then((p) => {
          if (p && p.is_running && p.stage !== "complete" && p.stage !== "idle") {
            setIndexProgress(p);
          } else {
            setIndexProgress(null);
          }
        })
        .catch(() => {});
    }, 600);

    return () => {
      clearInterval(pollInterval);
      unlistenProg?.();
      unlistenComp?.();
      unlistenErr?.();
    };
  }, [isOpen]);

  if (!isOpen || !config) return null;

  // 1. Pick Multiple Folders via Native OS Dialog
  const handlePickMultipleFolders = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: true,
        title: "검색 대상 폴더 또는 드라이브 선택 (복수 선택 가능)",
      });

      if (!selected) return;
      const rawPaths = Array.isArray(selected) ? selected : [selected];
      if (rawPaths.length === 0) return;

      const inputs: FolderAddInput[] = rawPaths.map((p) => ({ path: p }));
      const report = await api.addTargetFolders(inputs);
      setProcessReport(report);
      const updated = await api.getConfig();
      setConfig(updated);
      loadFolderStatuses();
      loadDrives();
    } catch (e: any) {
      alert("폴더 선택 오류: " + e);
    }
  };

  // 2. Add Drive Directly
  const handleQuickAddDrive = async (drive: DriveInfo) => {
    try {
      const inputs: FolderAddInput[] = [
        {
          name: `${drive.name} (${drive.mount_point})`,
          path: drive.mount_point,
        },
      ];
      const report = await api.addTargetFolders(inputs);
      setProcessReport(report);
      const updated = await api.getConfig();
      setConfig(updated);
      loadFolderStatuses();
      loadDrives();
    } catch (e: any) {
      alert("드라이브 추가 오류: " + e);
    }
  };

  // 3. Batch Add Paths from Text Input
  const handleAddBatchPaths = async () => {
    const trimmed = multiPathInput.trim();
    if (!trimmed) return;

    const rawLines = trimmed
      .split(/[\r\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawLines.length === 0) return;

    const inputs: FolderAddInput[] = rawLines.map((p) => ({ path: p }));
    try {
      const report = await api.addTargetFolders(inputs);
      setProcessReport(report);
      const updated = await api.getConfig();
      setConfig(updated);
      setMultiPathInput("");
      loadFolderStatuses();
      loadDrives();
    } catch (e: any) {
      alert("경로 추가 오류: " + e);
    }
  };

  const handleRemoveFolder = async (path: string) => {
    try {
      await api.removeTargetFolder(path);
      const updated = await api.getConfig();
      setConfig(updated);
      loadFolderStatuses();
      loadDrives();
    } catch (e: any) {
      alert("폴더 제거 오류: " + e);
    }
  };

  const handleTriggerIndexFolder = async (path: string) => {
    try {
      await api.triggerIndexing(path, true);
      loadFolderStatuses();
    } catch (e: any) {
      alert("색인 시작 실패: " + e);
    }
  };

  const handleAddBundle = async () => {
    if (!newBundleName.trim()) return;
    const exts = newBundleExts
      .split(",")
      .map((s) => s.trim().replace(/^\./, ""))
      .filter(Boolean);

    const newBundle: KnowledgeBundle = {
      id: "bundle-" + Date.now(),
      name: newBundleName,
      description: `${newBundlePreset} 관련 문서/코드 모음`,
      icon: "FileCode",
      paths: [],
      preset: newBundlePreset,
      extensions: exts,
      enabled: true,
    };

    try {
      await api.saveBundle(newBundle);
      const updated = await api.getConfig();
      setConfig(updated);
      setNewBundleName("");
    } catch (e: any) {
      alert("묶음 추가 오류: " + e);
    }
  };

  const handleDeleteBundle = async (id: string) => {
    try {
      await api.deleteBundle(id);
      const updated = await api.getConfig();
      setConfig(updated);
    } catch (e: any) {
      alert("묶음 삭제 오류: " + e);
    }
  };

  const handleSaveConfig = async () => {
    try {
      // Ensure latest target_paths from backend are preserved before saving config
      const latestBackendConfig = await api.getConfig();
      const mergedConfig: AppConfig = {
        ...config,
        indexing: {
          ...config.indexing,
          target_paths: latestBackendConfig.indexing.target_paths,
        },
        bundles: latestBackendConfig.bundles,
      };
      await api.saveConfig(mergedConfig);
      setConfig(mergedConfig);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1000);
    } catch (e: any) {
      alert("설정 저장 실패: " + e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="glass-panel w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/10 max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                {isInitialSetup ? "eg2-rag 초기 환경 설정" : "환경 설정 & RAG 묶음 관리"}
              </h2>
              <p className="text-xs text-slate-400">
                검색 대상 폴더 범위, DB 저장소 및 주제별 RAG 묶음을 설정합니다.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safety Guarantee Callout */}
        <div className="bg-emerald-950/40 border-b border-emerald-800/30 px-6 py-2.5 flex items-center gap-3 text-xs text-emerald-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>원본 파일 절대 무훼손 보장:</strong> 색인 및 검색 중 어떠한 원본 파일도 수정, 덮어쓰기, 삭제되지 않으며 읽기 전용 공유 모드로 안전하게 참조됩니다.
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 px-6 border-b border-white/10 bg-slate-900/40 text-xs font-medium">
          <button
            onClick={() => setActiveTab("paths")}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === "paths"
                ? "border-sky-400 text-sky-300 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>색인 대상 폴더 및 드라이브</span>
          </button>

          <button
            onClick={() => setActiveTab("bundles")}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === "bundles"
                ? "border-sky-400 text-sky-300 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>RAG 묶음 관리</span>
          </button>

          <button
            onClick={() => setActiveTab("governor")}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === "governor"
                ? "border-sky-400 text-sky-300 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>자원 조절기 (Resource Governor)</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {activeTab === "paths" && (
            <div className="space-y-5">
              {/* Process Report Alert Modal / Banner */}
              {processReport && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-sky-500/30 shadow-lg space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderTree className="w-4 h-4 text-sky-400" />
                      <span className="font-semibold text-slate-100 text-xs">
                        폴더/드라이브 관계 분석 및 처리 결과
                      </span>
                    </div>
                    <button
                      onClick={() => setProcessReport(null)}
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 text-[11px]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    {processReport.added_paths.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        신규 등록 {processReport.added_paths.length}건
                      </span>
                    )}
                    {processReport.removed_subfolders.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        상위 통합(하위 흡수) {processReport.removed_subfolders.length}건
                      </span>
                    )}
                    {processReport.skipped_subfolders.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        하위 폴더 건너뜀 {processReport.skipped_subfolders.length}건
                      </span>
                    )}
                    {processReport.skipped_duplicates.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                        중복 건너뜀 {processReport.skipped_duplicates.length}건
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {processReport.messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded-lg text-[11px] flex items-start gap-2 border ${
                          msg.severity === "Success"
                            ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200"
                            : msg.severity === "Warning"
                            ? "bg-amber-950/40 border-amber-500/30 text-amber-200"
                            : msg.severity === "Error"
                            ? "bg-rose-950/40 border-rose-500/30 text-rose-200"
                            : "bg-slate-900 border-white/10 text-slate-300"
                        }`}
                      >
                        {msg.severity === "Success" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
                        {msg.severity === "Warning" && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
                        {msg.severity === "Error" && <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />}
                        {msg.severity === "Info" && <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{msg.title}</p>
                          <p className="text-[10px] opacity-90 break-all">{msg.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION 1: Active Target Folders & Drives (Main Prominent Section) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                      <Folder className="w-4 h-4 text-sky-400" />
                      <span>현재 색인 대상 목록 ({targetFolders.length}개 등록됨)</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      아래 목록에 지정된 폴더 및 드라이브 내 파일만 색인 대상에 포함됩니다.
                    </p>
                  </div>

                  {/* Actions Header */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePickMultipleFolders}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center gap-1.5 transition-colors shadow-sm text-xs"
                      title="OS 탐색기에서 하나 또는 여러 폴더를 복수 선택합니다."
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>폴더 찾아보기 (복수 선택)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDrivePicker((prev) => !prev)}
                      className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors text-xs font-medium ${
                        showDrivePicker
                          ? "bg-slate-700 text-slate-100 border-sky-400/40"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10"
                      }`}
                      title="전체 드라이브 단위 추가 패널 토글"
                    >
                      <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                      <span>드라이브 전체 추가...</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowManualInput((prev) => !prev)}
                      className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition-colors text-xs font-medium ${
                        showManualInput
                          ? "bg-slate-700 text-slate-100 border-sky-400/40"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10"
                      }`}
                      title="경로 직접 입력 및 붙여넣기"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>경로 직접 입력</span>
                    </button>
                  </div>
                </div>

                {/* Scope Clarification Notice Card */}
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5 flex items-start gap-2 text-[11px] text-slate-300">
                  <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>색인 범위 안내:</strong> 등록되지 않은 C: 드라이브의 다른 폴더나 시스템 파일은 절대 색인되지 않습니다. 드라이브 전체를 색인하려면 우측 '드라이브 전체 추가'에서 해당 드라이브를 추가해 주세요.
                  </p>
                </div>

                {/* Collapsible Detected System Drives Panel */}
                {showDrivePicker && (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                        시스템 드라이브 전체 색인 추가 (주의: 드라이브 내 모든 파일 색인)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowDrivePicker(false)}
                        className="text-slate-400 hover:text-slate-200"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {drives.map((d, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all ${
                            d.is_already_targeted
                              ? "bg-sky-950/30 border-sky-500/40"
                              : "bg-slate-900/90 border-white/10 hover:border-sky-400/50"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-semibold text-slate-200 flex items-center gap-1">
                                <HardDrive className="w-3 h-3 text-indigo-400" />
                                <span>{d.mount_point}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">
                                {d.name}
                              </span>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/5">
                              {d.file_system}
                            </span>
                          </div>

                          <div className="mt-2 pt-1 border-t border-white/5 flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">
                              여유 {d.available_space_gb} GB / {d.total_space_gb} GB
                            </span>
                            {d.is_already_targeted ? (
                              <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> 등록됨
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleQuickAddDrive(d)}
                                className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[10px] transition-colors"
                              >
                                + 드라이브 추가
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Collapsible Multiple Paths Manual Entry */}
                {showManualInput && (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-white/10 space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">
                        경로 직접 입력 및 복수 일괄 추가
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowManualInput(false)}
                        className="text-slate-400 hover:text-slate-200"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="여러 경로를 줄바꿈이나 세미콜론(;)으로 구분하여 입력 (예: C:\Projects; D:\Data)"
                        value={multiPathInput}
                        onChange={(e) => setMultiPathInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddBatchPaths();
                          }
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-slate-100 text-xs font-mono outline-none focus:border-sky-400"
                      />
                      <button
                        onClick={handleAddBatchPaths}
                        className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center gap-1 transition-colors whitespace-nowrap text-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>추가</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Target Folders List with Front Status Indicators */}
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {targetFolders.map((tf, i) => {
                    const isCompleted = tf.status === "completed";
                    const isCurrentIndexing = tf.status === "indexing";
                    const isPending = tf.status === "pending";

                    return (
                      <div
                        key={i}
                        className="p-2.5 rounded-xl bg-slate-900/70 border border-white/5 hover:border-white/15 transition-all flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          {/* Folder/Drive Type Icon */}
                          <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${tf.is_drive ? "bg-indigo-500/20 text-indigo-400" : "bg-sky-500/20 text-sky-400"}`}>
                            {tf.is_drive ? <HardDrive className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                          </div>

                          <div className="min-w-0 flex-1">
                            {/* Front Status Indicator Badge & Name */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Indicator In Front */}
                              {isCurrentIndexing && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse">
                                  <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />
                                  <span>
                                    색인 진행 중...
                                    {indexProgress && indexProgress.total_files > 0
                                      ? ` (${indexProgress.processed_files}/${indexProgress.total_files} 파일 · ${indexProgress.percent.toFixed(0)}%)`
                                      : ""}
                                  </span>
                                </span>
                              )}
                              {isCompleted && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                  <span>색인 완료 ({tf.file_count}개 파일 · {tf.chunk_count}청크)</span>
                                </span>
                              )}
                              {isPending && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                  <span>색인 필요 (미색인)</span>
                                </span>
                              )}

                              <span className="font-semibold text-slate-100 text-xs">
                                {tf.name || (tf.is_drive ? "로컬 드라이브" : "대상 폴더")}
                              </span>

                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-white/5">
                                {tf.is_drive ? "전체 드라이브" : "지정 폴더"}
                              </span>
                            </div>

                            <span className="font-mono text-slate-400 text-[11px] truncate block mt-1">
                              {tf.path}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTriggerIndexFolder(tf.path)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-sky-600/30 text-slate-300 hover:text-sky-300 border border-white/5 hover:border-sky-400/40 text-[11px] transition-colors flex items-center gap-1"
                            title="이 폴더만 지금 즉시 색인"
                          >
                            <Zap className="w-3 h-3 text-sky-400" />
                            <span>색인</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFolder(tf.path)}
                            className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                            title="대상에서 제거"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {targetFolders.length === 0 && (
                    <div className="p-6 rounded-xl bg-slate-900/40 border border-dashed border-white/10 text-center space-y-2">
                      <FolderPlus className="w-6 h-6 text-slate-500 mx-auto" />
                      <p className="text-slate-400 font-medium text-xs">
                        등록된 색인 대상 폴더가 없습니다.
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        위 '폴더 찾아보기' 버튼을 눌러 문서나 소스코드가 있는 폴더를 추가해 주세요.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 2: Advanced Internal Storage Location (Moved to bottom) */}
              <div className="pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowAdvancedStorage((prev) => !prev)}
                  className="flex items-center justify-between w-full text-left py-1 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <span className="font-medium text-[11px] flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5 text-slate-500" />
                    <span>내부 데이터베이스 및 모델 저장 위치 (고급 설정)</span>
                  </span>
                  {showAdvancedStorage ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showAdvancedStorage && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-900/50 border border-white/5 space-y-2 animate-in fade-in">
                    <p className="text-[11px] text-slate-400">
                      시맨틱 검색용 임베딩 벡터 DB와 로컬 AI 모델 캐시가 격리 보관되는 경로입니다. (색인 대상 폴더와 무관한 내부 저장소입니다)
                    </p>
                    <input
                      type="text"
                      value={config.storage.base_dir}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          storage: { ...config.storage, base_dir: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-slate-100 font-mono text-xs focus:border-sky-400 outline-none"
                    />
                    <p className="text-[10px] text-slate-500">
                      기본값: C:\RAG_EG2
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "bundles" && (
            <div className="space-y-4">
              <p className="text-slate-400">
                특정 언어(Python, C++ 등) 또는 특정 폴더의 파일만 모아 전문적인 지식 묶음(RAG Bundle)을 구성합니다.
              </p>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {config.bundles.map((bundle) => (
                  <div
                    key={bundle.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-white/5"
                  >
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        <span>{bundle.name}</span>
                        <span className="text-[10px] text-sky-400 bg-sky-950/60 px-1.5 py-0.2 rounded border border-sky-800/40">
                          {bundle.preset}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        확장자: {bundle.extensions.join(", ")}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteBundle(bundle.id)}
                      className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                      title="묶음 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5 space-y-2">
                <span className="font-semibold text-slate-200">새 RAG 묶음 등록</span>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="묶음 명칭 (예: 백엔드 Python)"
                    value={newBundleName}
                    onChange={(e) => setNewBundleName(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-100 text-xs outline-none"
                  />
                  <select
                    value={newBundlePreset}
                    onChange={(e) => {
                      setNewBundlePreset(e.target.value);
                      if (e.target.value === "python") setNewBundleExts("py, ipynb, pyi");
                      if (e.target.value === "cpp") setNewBundleExts("cpp, hpp, c, h");
                      if (e.target.value === "markdown") setNewBundleExts("md, markdown");
                      if (e.target.value === "image") setNewBundleExts("png, jpg, jpeg, gif, webp, bmp, svg, ico");
                      if (e.target.value === "video") setNewBundleExts("mp4, webm, mkv, avi, mov, wmv, flv");
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-100 text-xs outline-none"
                  >
                    <option value="python">Python 전용</option>
                    <option value="cpp">C/C++ 전용</option>
                    <option value="markdown">마크다운 문서 전용</option>
                    <option value="image">이미지 미디어 전용</option>
                    <option value="video">동영상 미디어 전용</option>
                    <option value="custom">사용자 지정</option>
                  </select>
                  <input
                    type="text"
                    placeholder="확장자 (쉼표 구분)"
                    value={newBundleExts}
                    onChange={(e) => setNewBundleExts(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-100 text-xs outline-none"
                  />
                </div>
                <button
                  onClick={handleAddBundle}
                  className="w-full py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center justify-center gap-1.5 transition-colors mt-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>새 RAG 묶음 추가</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === "governor" && (
            <div className="space-y-4">
              <p className="text-slate-400">
                색인 작업 시 시스템 CPU 및 RAM 자원이 여유 있을 때만 진행하도록 조절합니다.
              </p>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300 font-medium">최대 허용 CPU 점유율</span>
                  <span className="text-sky-400 font-mono font-semibold">
                    {config.resource_governor.max_cpu_percent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="95"
                  value={config.resource_governor.max_cpu_percent}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      resource_governor: {
                        ...config.resource_governor,
                        max_cpu_percent: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  시스템 CPU 점유율이 이 수치를 초과하면 색인이 일시 중단됩니다.
                </p>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300 font-medium">최대 허용 RAM 점유율</span>
                  <span className="text-sky-400 font-mono font-semibold">
                    {config.resource_governor.max_ram_percent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="95"
                  value={config.resource_governor.max_ram_percent}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      resource_governor: {
                        ...config.resource_governor,
                        max_ram_percent: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  시스템 메모리 점유율이 이 수치를 초과하면 색인이 일시 중단됩니다.
                </p>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.resource_governor.enabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        resource_governor: {
                          ...config.resource_governor,
                          enabled: e.target.checked,
                        },
                      })
                    }
                    className="rounded bg-slate-900 border-white/10 text-sky-500 focus:ring-0"
                  />
                  <span className="text-slate-300">자원 조절기 활성화 (권장)</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-slate-900/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {savedSuccess && (
              <span className="text-emerald-400 font-medium flex items-center gap-1 animate-in fade-in">
                <Check className="w-3.5 h-3.5" /> 설정이 성공적으로 저장되었습니다.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
            >
              닫기
            </button>
            <button
              onClick={handleSaveConfig}
              className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-colors shadow-md"
            >
              설정 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
