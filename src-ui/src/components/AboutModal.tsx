import React from "react";
import { X, ShieldCheck, Search, FolderTree, Layers, Keyboard, HelpCircle } from "lucide-react";
import appIcon from "../assets/App_icon.png";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="glass-panel w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/10 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-slate-900/80">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">프로그램 정보 및 도움말</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
          {/* Identity Section: App Icon, Name, Version & Author */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/70 border border-white/5">
            <img
              src={appIcon}
              alt="eg2-rag Logo"
              className="w-16 h-16 rounded-2xl object-cover shadow-lg border border-sky-400/30 shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">eg2-rag</h1>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/40 text-[10px] font-mono font-semibold">
                  v0.1.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                EmbeddingGemma-2 기반 초저전력 로컬 시맨틱 검색 엔진
              </p>
              <div className="pt-1 flex items-center gap-3 text-[11px]">
                <span className="text-slate-400">
                  제작자: <strong className="text-sky-300 font-medium">azovlive</strong>
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">
                  아키텍처: <span className="text-slate-300">Gemma2 256d</span>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Help Guide */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
              <span>아주 간단한 사용 도움말</span>
            </h3>

            <div className="grid grid-cols-1 gap-2.5">
              {/* Item 1: Search */}
              <div className="p-3 rounded-xl bg-slate-900/50 border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-sky-500/15 text-sky-400 shrink-0 mt-0.5">
                  <Search className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-slate-100 text-xs">의미 기반 시맨틱 검색</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    단순 키워드 일치뿐만 아니라, "로그인 처리 코드", "프로젝트 아키텍처 명세"와 같이 일상 문장으로도 문서와 코드의 문맥적 의미를 즉시 찾아냅니다.
                  </p>
                </div>
              </div>

              {/* Item 2: Target Folders */}
              <div className="p-3 rounded-xl bg-slate-900/50 border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-400 shrink-0 mt-0.5">
                  <FolderTree className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-slate-100 text-xs">복수 폴더 및 드라이브 관리</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    상단 우측 설정(⚙️) 아이콘을 눌러 검색 대상 폴더 및 드라이브를 복수로 등록할 수 있으며, 하위 폴더나 상위 폴더는 자동으로 중복 없이 최적화 통합됩니다.
                  </p>
                </div>
              </div>

              {/* Item 3: Bundles */}
              <div className="p-3 rounded-xl bg-slate-900/50 border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 shrink-0 mt-0.5">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-slate-100 text-xs">맞춤형 RAG 지식 묶음</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    파이썬 코드, 마크다운 문서, 이미지, 동영상 등 원하는 파일 유형만 선택하여 집중 검색할 수 있습니다.
                  </p>
                </div>
              </div>

              {/* Item 4: Safety Guarantee */}
              <div className="p-3 rounded-xl bg-slate-900/50 border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-teal-500/15 text-teal-400 shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-slate-100 text-xs">원본 파일 무훼손 보장 (Shared Read-Only)</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    모든 원본 파일은 읽기 전용 공유 모드로만 참조되며, 원본 파일이 절대 수정되거나 삭제되지 않습니다.
                  </p>
                </div>
              </div>

              {/* Item 5: Keyboard Shortcuts */}
              <div className="p-3 rounded-xl bg-slate-900/50 border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 shrink-0 mt-0.5">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-slate-100 text-xs">단축키 안내</p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-400 pt-0.5">
                    <span className="inline-flex items-center gap-1 font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-200">
                      Ctrl + ,
                    </span>
                    <span>환경 설정 열기</span>
                    <span className="text-slate-600">·</span>
                    <span className="inline-flex items-center gap-1 font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-200">
                      Ctrl + R
                    </span>
                    <span>색인 시작</span>
                    <span className="text-slate-600">·</span>
                    <span className="inline-flex items-center gap-1 font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-200">
                      Esc
                    </span>
                    <span>창 닫기</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-slate-900/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            © 2026 azovlive. All rights reserved.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-colors shadow-md"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
