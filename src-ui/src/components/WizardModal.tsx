import React, { useState, useEffect } from "react";
import { AppConfig, KnowledgeBundle } from "../types";
import { api } from "../api";
import { X, Folder, Plus, Trash2, Check, ShieldCheck, Layers, Settings, Cpu } from "lucide-react";

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
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderPath, setNewFolderPath] = useState("");
  const [newBundleName, setNewBundleName] = useState("");
  const [newBundlePreset, setNewBundlePreset] = useState("python");
  const [newBundleExts, setNewBundleExts] = useState("py, ipynb");
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.getConfig().then(setConfig).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen || !config) return null;

  const handleAddTargetFolder = async () => {
    if (!newFolderPath.trim()) return;
    try {
      await api.addTargetFolder(newFolderName || "Custom Folder", newFolderPath);
      const updated = await api.getConfig();
      setConfig(updated);
      setNewFolderName("");
      setNewFolderPath("");
    } catch (e: any) {
      alert("폴더 추가 오류: " + e);
    }
  };

  const handleRemoveFolder = async (path: string) => {
    try {
      await api.removeTargetFolder(path);
      const updated = await api.getConfig();
      setConfig(updated);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="glass-panel w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/10 max-h-[90vh]">
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
            <span>색인 대상 폴더 및 저장소</span>
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
            <span>RAG 묶음 분류</span>
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
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          {activeTab === "paths" && (
            <div className="space-y-4">
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

              <div>
                <label className="block text-slate-300 font-medium mb-2">
                  색인 대상 폴더 목록
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {config.indexing.target_paths.map((folder, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-white/5"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-slate-200 mr-2">
                          {folder.name}
                        </span>
                        <span className="font-mono text-slate-400 text-[11px] truncate">
                          {folder.path}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveFolder(folder.path)}
                        className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                        title="제거"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    placeholder="폴더 이름 (예: Project Code)"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-1/3 px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-100 text-xs outline-none"
                  />
                  <input
                    type="text"
                    placeholder="경로 입력 (예: C:\Users\username\Documents)"
                    value={newFolderPath}
                    onChange={(e) => setNewFolderPath(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-100 text-xs font-mono outline-none"
                  />
                  <button
                    onClick={handleAddTargetFolder}
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>추가</span>
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
                  <span className="font-mono text-sky-400 font-bold">
                    {config.resource_governor.max_cpu_percent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="90"
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
                  className="w-full accent-sky-400"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  시스템 CPU 점유율이 이 값을 초과하면 색인 작업을 자동으로 일시 일시정지(Yield)합니다.
                </p>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300 font-medium">최대 허용 RAM 점유율</span>
                  <span className="font-mono text-sky-400 font-bold">
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
                  className="w-full accent-sky-400"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  시스템 가용 메모리가 부족해지면 즉시 대기하여 사용자 앱 반응성을 최우선으로 보호합니다.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-slate-900/80">
          <span className="text-xs text-slate-500">
            설정은 즉시 저장되고 다음 인덱싱에 반영됩니다.
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              닫기
            </button>
            <button
              onClick={handleSaveConfig}
              className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold transition-all flex items-center gap-1.5 shadow-sm"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-emerald-950" /> : null}
              <span>{savedSuccess ? "저장 완료" : "설정 적용"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
