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
  current_file: string;
  processed_files: number;
  total_files: number;
  percent: number;
  is_paused: boolean;
}
