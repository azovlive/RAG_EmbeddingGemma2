import React, { useState, useEffect } from "react";
import { AppConfig, DriveInfo, FolderAddInput, KnowledgeBundle, TargetProcessReport } from "../types";
import { api } from "../api";
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
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [showDrivePicker, setShowDrivePicker] = useState<boolean>(true);
  const [multiPathInput, setMultiPathInput] = useState<string>("");
  const [processReport, setProcessReport] = useState<TargetProcessReport | null>(null);

  const [newBundleName, setNewBundleName] = useState("");
  const [newBundlePreset, setNewBundlePreset] = useState("python");
  const [newBundleExts, setNewBundleExts] = useState("py, ipynb");
  const [savedSuccess, setSavedSuccess] = useState(false);

  const loadDrives = () => {
    api.getAvailableDrives()
      .then(setDrives)
      .catch((err) => console.error("드라이브 목록 조회 실패:", err));
  };

  useEffect(() => {
    if (isOpen) {
      api.getConfig().then(setConfig).catch(console.error);
      loadDrives();
    }
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
      loadDrives();
    } catch (e: any) {
      alert("폴더 제거 오류: " + e);
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
      await api.saveConfig(config);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1000);
    } catch (e: any) {
      alert("설정 저장 실패: " + e);
    }
  };

  const isDrivePath = (p: string) => {
    const s = p.trim().replace(/\\/g, "/");
    return (s.length === 3 && s[1] === ":" && s[2] === "/") || s === "/" || (s.length === 2 && s[1] === ":");
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
                DB 저장소, 색인 폴더 범위 및 주제별 RAG 묶음을 설정합니다.
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
            <span>저장소 및 색인 폴더/드라이브</span>
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

              {/* 1. Base storage folder */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  데이터베이스 및 모델 베이스 폴더
                </label>
                <input
                  type="text"
                  value={config.storage.base_dir}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      storage: { ...config.storage, base_dir: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-slate-100 font-mono text-xs focus:border-sky-400 outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  기본값: C:\RAG_EG2 (벡터 DB, 임베딩 캐시 및 온디바이스 모델 저장)
                </p>
              </div>

              {/* 2. Target folders & drives management */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-300 font-medium">
                    색인 대상 폴더 및 드라이브 목록 (복수 지정 지원)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDrivePicker((prev) => !prev)}
                      className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 flex items-center gap-1.5 transition-colors text-[11px]"
                    >
                      <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                      <span>{showDrivePicker ? "드라이브 숨기기" : "드라이브 빠른 선택"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePickMultipleFolders}
                      className="px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center gap-1.5 transition-colors shadow-sm text-[11px]"
                      title="OS 폴더 탐색기에서 하나 또는 여러 폴더를 복수 선택합니다."
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>폴더 찾아보기 (복수 선택)</span>
                    </button>
                  </div>
                </div>

                {/* Detected System Drives Panel */}
                {showDrivePicker && drives.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-900/70 border border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                        감지된 시스템 드라이브 (클릭하여 즉시 추가)
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        드라이브 추가 시 하위 폴더는 자동으로 상위 드라이브로 통합됩니다.
                      </span>
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
                                <HardDrive className="w-3 h-3 text-sky-400" />
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
                                className="px-2 py-0.5 rounded bg-sky-600/80 hover:bg-sky-500 text-white font-medium text-[10px] transition-colors"
                              >
                                + 추가
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Currently Registered Target Paths List */}
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {config.indexing.target_paths.map((folder, i) => {
                    const isDrive = isDrivePath(folder.path);
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/70 border border-white/5 hover:border-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div className={`p-1.5 rounded-md ${isDrive ? "bg-indigo-500/20 text-indigo-400" : "bg-sky-500/20 text-sky-400"}`}>
                            {isDrive ? <HardDrive className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200">
                                {folder.name}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-white/5">
                                {isDrive ? "전체 드라이브" : "폴더"}
                              </span>
                            </div>
                            <span className="font-mono text-slate-400 text-[11px] truncate block">
                              {folder.path}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveFolder(folder.path)}
                          className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                          title="목록에서 제거"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {config.indexing.target_paths.length === 0 && (
                    <div className="p-4 rounded-lg bg-slate-900/40 border border-dashed border-white/10 text-center text-slate-500 text-[11px]">
                      등록된 색인 대상이 없습니다. 위 '폴더 찾아보기' 또는 드라이브를 추가해 주세요.
                    </div>
                  )}
                </div>

                {/* Multiple Paths Manual / Paste Entry */}
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="여러 경로를 줄바꿈이나 세미콜론(;)으로 구분하여 일괄 입력 (예: C:\Dev\Code; D:\Data)"
                    value={multiPathInput}
                    onChange={(e) => setMultiPathInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddBatchPaths();
                      }
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-100 text-xs font-mono outline-none focus:border-sky-400"
                  />
                  <button
                    onClick={handleAddBatchPaths}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>일괄 추가</span>
                  </button>
                </div>
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
