import { invoke } from "@tauri-apps/api/core";
import { AppConfig, DbChunk, DriveInfo, FolderAddInput, ImageDataResponse, IndexProgress, KnowledgeBundle, SearchResult, SimilarFileResult, SystemStatus, TargetProcessReport } from "./types";

const imageCache = new Map<string, Promise<ImageDataResponse>>();

export const api = {
  // Search
  search: (query: string, bundleId?: string, topK?: number): Promise<SearchResult[]> =>
    invoke("search_query", { query, bundleId: bundleId === "all" ? null : bundleId, topK }),

  getSimilarFiles: (filePath: string, topK?: number): Promise<SimilarFileResult[]> =>
    invoke("get_similar_files", { filePath, topK }),

  getFileChunks: (filePath: string): Promise<DbChunk[]> =>
    invoke("get_file_chunks", { filePath }),

  getFileContext: (filePath: string): Promise<string> =>
    invoke("get_file_context", { filePath }),

  // Bundles
  listBundles: (): Promise<KnowledgeBundle[]> =>
    invoke("list_bundles"),

  saveBundle: (bundle: KnowledgeBundle): Promise<void> =>
    invoke("save_bundle", { bundle }),

  deleteBundle: (bundleId: string): Promise<void> =>
    invoke("delete_bundle", { bundleId }),

  // Config
  getConfig: (): Promise<AppConfig> =>
    invoke("get_app_config"),

  saveConfig: (newConfig: AppConfig): Promise<void> =>
    invoke("save_app_config", { newConfig }),

  getAvailableDrives: (): Promise<DriveInfo[]> =>
    invoke("get_available_drives"),

  addTargetFolders: (inputs: FolderAddInput[]): Promise<TargetProcessReport> =>
    invoke("add_target_folders", { inputs }),

  addTargetFolder: (name: string, pathStr: string): Promise<TargetProcessReport> =>
    invoke("add_target_folder", { name, pathStr }),

  removeTargetFolder: (pathStr: string): Promise<void> =>
    invoke("remove_target_folder", { pathStr }),

  checkFirstRun: (): Promise<boolean> =>
    invoke("check_first_run"),

  // System
  getSystemStatus: (): Promise<SystemStatus> =>
    invoke("get_system_status"),

  revealInExplorer: (filePath: string): Promise<void> =>
    invoke("reveal_in_explorer", { filePath }),

  openInEditor: (filePath: string, line?: number): Promise<void> =>
    invoke("open_in_editor", { filePath, line }),

  openFileDefault: (filePath: string): Promise<void> =>
    invoke("open_file_default", { filePath }),

  getImageData: (filePath: string): Promise<ImageDataResponse> => {
    if (!imageCache.has(filePath)) {
      const promise = invoke<ImageDataResponse>("get_image_data", { filePath });
      imageCache.set(filePath, promise);
      // Evict on error so retry works
      promise.catch(() => imageCache.delete(filePath));
    }
    return imageCache.get(filePath)!;
  },

  getNpuPreference: (): Promise<boolean> =>
    invoke("get_npu_preference"),

  setNpuPreference: (preferNpu: boolean): Promise<boolean> =>
    invoke("set_npu_preference", { preferNpu }),

  // Index
  triggerIndexing: (targetFolder?: string, force?: boolean): Promise<void> =>
    invoke("trigger_indexing", { targetFolder: targetFolder ?? null, force: force ?? false }),

  pauseIndexing: (): Promise<void> =>
    invoke("pause_indexing"),

  resumeIndexing: (): Promise<void> =>
    invoke("resume_indexing"),

  cancelIndexing: (): Promise<void> =>
    invoke("cancel_indexing"),

  getIndexingState: (): Promise<{ is_running: boolean; is_paused: boolean; total_chunks: number }> =>
    invoke("get_indexing_state"),

  getIndexingProgress: (): Promise<IndexProgress> =>
    invoke("get_indexing_progress"),

  getIndexCount: (): Promise<number> =>
    invoke("get_index_count"),
};
