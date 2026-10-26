export interface DbChunk {
  id: string;
  file_path: string;
  display_path: string;
  file_name: string;
  ext: string;
  lang: string;
  symbol: string;
  start_line: number;
  end_line: number;
  chunk_index: number;
  content: string;
  file_hash: string;
  mtime: number;
  vector?: number[];
}

export interface SearchResult {
  chunk: DbChunk;
  score: number;
}

export interface SimilarFileResult {
  display_path: string;
  file_name: string;
  ext: string;
  score: number;
}

export interface KnowledgeBundle {
  id: string;
  name: string;
  description: string;
  icon: string;
  paths: string[];
  preset: string;
  extensions: string[];
  enabled: boolean;
}

export interface TargetFolder {
  name: string;
  path: string;
  enabled: boolean;
}

export interface AppConfig {
  storage: {
    base_dir: string;
    lancedb_dir: string;
    models_dir: string;
  };
  indexing: {
    target_paths: TargetFolder[];
    exclude_patterns: string[];
    skip_cloud_placeholders: boolean;
  };
  bundles: KnowledgeBundle[];
  inference: {
    device: string;
    vector_dim: number;
  };
  resource_governor: {
    enabled: boolean;
    max_cpu_percent: number;
    max_ram_percent: number;
  };
}

export interface SystemStatus {
  cpu_usage: number;
  ram_usage: number;
  is_throttled: boolean;
  total_chunks: number;
}

export interface IndexProgress {
  stage?: string; // "idle" | "initializing" | "scanning" | "indexing" | "complete"
  current_file: string;
  processed_files: number;
  total_files: number;
  percent: number;
  is_paused: boolean;
  is_running?: boolean;
}

export interface IndexingState {
  is_running: boolean;
  is_paused: boolean;
  total_chunks: number;
}

export interface ImageDataResponse {
  data_url: string;
  file_size: number;
  formatted_size: string;
  mime_type: string;
  ext: string;
}

export type FileCategory = "image" | "video" | "document" | "code";

export const isImageFile = (ext?: string): boolean => {
  if (!ext) return false;
  const clean = ext.toLowerCase().replace(/^\./, "");
  return ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "tiff", "tif", "avif"].includes(clean);
};

export const isVideoFile = (ext?: string): boolean => {
  if (!ext) return false;
  const clean = ext.toLowerCase().replace(/^\./, "");
  return ["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv", "m4v"].includes(clean);
};

export const isDocumentFile = (ext?: string): boolean => {
  if (!ext) return false;
  const clean = ext.toLowerCase().replace(/^\./, "");
  return [
    "pdf", "md", "markdown", "txt", "csv", "log", "rtf",
    "doc", "docx", "ppt", "pptx", "xls", "xlsx", "hwp", "hwpx",
    "json", "yaml", "yml", "toml", "xml"
  ].includes(clean);
};

export const getFileCategory = (ext?: string): FileCategory => {
  if (isImageFile(ext)) return "image";
  if (isVideoFile(ext)) return "video";
  if (isDocumentFile(ext)) return "document";
  return "code";
};
