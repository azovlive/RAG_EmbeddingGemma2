use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use anyhow::Result;
use tokio::sync::mpsc;
use serde::{Deserialize, Serialize};

use super::config::AppConfig;
use super::db::{DbChunk, VectorDatabase};
use super::embedder::Embedder;
use super::bundle::normalize_path_for_query;
use super::cloud_filter::is_cloud_placeholder;
use super::code_chunker::CodeChunker;
use super::extractor::TextExtractor;
use super::pdf_parser::PdfParser;
use super::resource_governor::ResourceGovernor;
use super::path_helper::prune_subdirectories;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexProgress {
    #[serde(default)]
    pub stage: String, // "idle", "initializing", "scanning", "indexing", "complete"
    pub current_file: String,
    pub processed_files: usize,
    pub total_files: usize,
    pub percent: f32,
    pub is_paused: bool,
    #[serde(default)]
    pub is_running: bool,
}

struct IndexRunGuard(Arc<AtomicBool>, Arc<AtomicBool>, Arc<tokio::sync::RwLock<Option<String>>>);
impl Drop for IndexRunGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
        self.1.store(false, Ordering::SeqCst);
        if let Ok(mut lock) = self.2.try_write() {
            *lock = None;
        }
    }
}

pub struct Indexer {
    pub config: Arc<tokio::sync::RwLock<AppConfig>>,
    pub db: Arc<VectorDatabase>,
    pub embedder: Arc<Embedder>,
    pub governor: Arc<ResourceGovernor>,
    pub is_paused: Arc<AtomicBool>,
    pub is_running: Arc<AtomicBool>,
    pub is_cancelled: Arc<AtomicBool>,
    pub active_target_folder: Arc<tokio::sync::RwLock<Option<String>>>,
    pub current_progress: Arc<tokio::sync::RwLock<IndexProgress>>,
}

impl Indexer {
    pub fn new(
        config: Arc<tokio::sync::RwLock<AppConfig>>,
        db: Arc<VectorDatabase>,
        embedder: Arc<Embedder>,
        governor: Arc<ResourceGovernor>,
    ) -> Self {
        Self {
            config,
            db,
            embedder,
            governor,
            is_paused: Arc::new(AtomicBool::new(false)),
            is_running: Arc::new(AtomicBool::new(false)),
            is_cancelled: Arc::new(AtomicBool::new(false)),
            active_target_folder: Arc::new(tokio::sync::RwLock::new(None)),
            current_progress: Arc::new(tokio::sync::RwLock::new(IndexProgress {
                stage: "idle".to_string(),
                current_file: "".to_string(),
                processed_files: 0,
                total_files: 0,
                percent: 0.0,
                is_paused: false,
                is_running: false,
            })),
        }
    }

    pub fn pause(&self) {
        self.is_paused.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.is_paused.store(false, Ordering::SeqCst);
    }

    pub fn cancel(&self) {
        self.is_cancelled.store(true, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst);
    }

    pub fn is_currently_paused(&self) -> bool {
        self.is_paused.load(Ordering::SeqCst)
    }

    pub fn is_currently_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    pub async fn get_active_folder(&self) -> Option<String> {
        self.active_target_folder.read().await.clone()
    }

    pub async fn clear_running_state(&self) {
        self.is_running.store(false, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst);
        *self.active_target_folder.write().await = None;
    }

    pub async fn update_progress(
        &self,
        tx: &Option<mpsc::Sender<IndexProgress>>,
        prog: IndexProgress,
    ) {
        {
            let mut lock = self.current_progress.write().await;
            *lock = prog.clone();
        }
        if let Some(ref sender) = tx {
            let _ = sender.send(prog).await;
        }
    }

    pub async fn index_all(
        &self,
        target_folder: Option<String>,
        force: bool,
        progress_tx: Option<mpsc::Sender<IndexProgress>>,
    ) -> Result<usize> {
        let _guard = IndexRunGuard(
            self.is_running.clone(),
            self.is_paused.clone(),
            self.active_target_folder.clone(),
        );
        *self.active_target_folder.write().await = target_folder.clone();
        self.is_running.store(true, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst);
        self.is_cancelled.store(false, Ordering::SeqCst);

        // Stage 1: If force re-index, clear database first and notify UI
        if force {
            self.update_progress(
                &progress_tx,
                IndexProgress {
                    stage: "initializing".to_string(),
                    current_file: "기존 색인 데이터 초기화 중...".to_string(),
                    processed_files: 0,
                    total_files: 0,
                    percent: 0.0,
                    is_paused: false,
                    is_running: true,
                },
            ).await;

            if let Some(ref folder) = target_folder {
                let norm = normalize_path_for_query(Path::new(folder));
                let _ = self.db.clear_folder(&norm).await;
            } else {
                let _ = self.db.clear_all().await;
            }
        }

        // Stage 2: Target File Discovery (walkdir)
        self.update_progress(
            &progress_tx,
            IndexProgress {
                stage: "scanning".to_string(),
                current_file: "색인 대상 파일 탐색 중...".to_string(),
                processed_files: 0,
                total_files: 0,
                percent: 0.0,
                is_paused: false,
                is_running: true,
            },
        ).await;

        let conf = self.config.read().await.clone();
        let mut candidate_files = Vec::new();

        let search_dirs: Vec<std::path::PathBuf> = if let Some(ref folder) = target_folder {
            vec![std::path::PathBuf::from(folder)]
        } else {
            let targets: Vec<std::path::PathBuf> = conf.indexing
                .target_paths
                .iter()
                .filter(|t| t.enabled && t.path.exists())
                .map(|t| t.path.clone())
                .collect();
            prune_subdirectories(targets)
        };

        for dir in search_dirs {
            if !dir.exists() {
                continue;
            }
            for entry in walkdir::WalkDir::new(&dir)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    let path = entry.path().to_path_buf();

                    // Check exclude patterns relative to target root
                    if let Ok(rel) = path.strip_prefix(&dir) {
                        let excluded = conf.indexing.exclude_patterns.iter().any(|pattern| {
                            rel.components().any(|c| c.as_os_str() == pattern.as_str())
                        });
                        if excluded {
                            continue;
                        }
                    }

                    // Check cloud placeholder (Zero-download invariant)
                    if conf.indexing.skip_cloud_placeholders && is_cloud_placeholder(&path) {
                        continue;
                    }

                    candidate_files.push(path);
                }
            }
        }

        // Stage 3: Filtering (Determine which files actually need indexing)
        let mut files_to_index = Vec::new();

        if force {
            files_to_index = candidate_files;
        } else {
            for path in candidate_files {
                if self.is_cancelled.load(Ordering::SeqCst) {
                    self.clear_running_state().await;
                    return Ok(0);
                }
                let normalized = normalize_path_for_query(&path);
                if let Some(existing_hash) = self.db.get_existing_hash(&normalized).await {
                    if let Ok(content_bytes) = std::fs::read(&path) {
                        let file_hash = format!("{:016x}", xxhash_rust::xxh3::xxh3_64(&content_bytes));
                        if existing_hash == file_hash {
                            continue; // File already indexed and up-to-date
                        }
                    }
                }
                files_to_index.push(path);
            }
        }

        let total = files_to_index.len();

        // If 0 files need indexing, finish cleanly and inform UI immediately
        if total == 0 {
            self.clear_running_state().await;
            self.update_progress(
                &progress_tx,
                IndexProgress {
                    stage: "complete".to_string(),
                    current_file: "모든 파일이 최신 상태입니다 (색인 대상 0개)".to_string(),
                    processed_files: 0,
                    total_files: 0,
                    percent: 100.0,
                    is_paused: false,
                    is_running: false,
                },
            ).await;
            return Ok(0);
        }

        // Stage 4: Actual File Indexing & Embedding with NPU
        self.update_progress(
            &progress_tx,
            IndexProgress {
                stage: "indexing".to_string(),
                current_file: format!("총 {}개 대상 파일 색인 시작...", total),
                processed_files: 0,
                total_files: total,
                percent: 0.0,
                is_paused: false,
                is_running: true,
            },
        ).await;

        for (idx, file_path) in files_to_index.into_iter().enumerate() {
            // Check User Cancel
            if self.is_cancelled.load(Ordering::SeqCst) {
                tracing::info!("Indexing cancelled by user at file {}/{}", idx, total);
                let _ = self.db.persist().await;
                self.clear_running_state().await;
                self.update_progress(
                    &progress_tx,
                    IndexProgress {
                        stage: "idle".to_string(),
                        current_file: "색인 작업이 취소되었습니다.".to_string(),
                        processed_files: idx,
                        total_files: total,
                        percent: if total > 0 { (idx as f32 / total as f32) * 100.0 } else { 100.0 },
                        is_paused: false,
                        is_running: false,
                    },
                ).await;
                return Ok(idx);
            }

            // Check User Manual Pause
            while self.is_paused.load(Ordering::SeqCst) {
                if self.is_cancelled.load(Ordering::SeqCst) {
                    let _ = self.db.persist().await;
                    self.clear_running_state().await;
                    return Ok(idx);
                }
                self.update_progress(
                    &progress_tx,
                    IndexProgress {
                        stage: "indexing".to_string(),
                        current_file: file_path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
                        processed_files: idx,
                        total_files: total,
                        percent: if total > 0 { (idx as f32 / total as f32) * 100.0 } else { 100.0 },
                        is_paused: true,
                        is_running: true,
                    },
                ).await;
                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
            }

            // Check Resource Governor
            let (_, _, should_pause) = self.governor.check_system().await;
            if should_pause {
                tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
            }

            let file_name = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let _ = self.index_single_file(&file_path, force).await;

            // Batch persist every 25 files to avoid disk contention
            if (idx + 1) % 25 == 0 {
                let _ = self.db.persist().await;
            }

            self.update_progress(
                &progress_tx,
                IndexProgress {
                    stage: "indexing".to_string(),
                    current_file: file_name,
                    processed_files: idx + 1,
                    total_files: total,
                    percent: if total > 0 { ((idx + 1) as f32 / total as f32) * 100.0 } else { 100.0 },
                    is_paused: false,
                    is_running: true,
                },
            ).await;
        }

        // Final persist of all accumulated chunks
        let _ = self.db.persist().await;

        // Clear running state BEFORE emitting "complete" progress so UI status queries immediately see completed state
        self.clear_running_state().await;

        self.update_progress(
            &progress_tx,
            IndexProgress {
                stage: "complete".to_string(),
                current_file: format!("총 {}개 파일 색인 완료", total),
                processed_files: total,
                total_files: total,
                percent: 100.0,
                is_paused: false,
                is_running: false,
            },
        ).await;

        Ok(total)
    }

    pub async fn index_single_file(&self, path: &Path, force: bool) -> Result<()> {
        if !path.is_file() {
            return Ok(());
        }

        // Zero-Modification Guarantee: Check cloud placeholder without opening
        if is_cloud_placeholder(path) {
            return Ok(());
        }

        // Shared Read-Only: Open with read-only permission without locks
        let content_bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(_) => return Ok(()), // Gracefully skip inaccessible or locked files
        };

        let file_hash = format!("{:016x}", xxhash_rust::xxh3::xxh3_64(&content_bytes));
        let normalized = normalize_path_for_query(path);

        // Check if hash matches existing record (unless force is true)
        if !force {
            if let Some(existing_hash) = self.db.get_existing_hash(&normalized).await {
                if existing_hash == file_hash {
                    return Ok(()); // File unchanged, skip
                }
            }
        }

        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        let display_path = path.to_string_lossy().to_string();
        let mtime = std::fs::metadata(path)
            .and_then(|m| m.modified())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
            .unwrap_or(0);

        let is_image = matches!(
            ext.as_str(),
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "ico" | "tiff" | "tif" | "avif"
        );
        let is_video = matches!(
            ext.as_str(),
            "mp4" | "webm" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "m4v"
        );
        let is_office_doc = matches!(
            ext.as_str(),
            "doc" | "docx" | "ppt" | "pptx" | "xls" | "xlsx" | "hwp" | "hwpx"
        );

        // Parse chunks according to file extension
        let chunks = if is_image {
            let file_len = content_bytes.len();
            let formatted_size = if file_len < 1024 {
                format!("{} B", file_len)
            } else if file_len < 1024 * 1024 {
                format!("{:.1} KB", file_len as f64 / 1024.0)
            } else {
                format!("{:.1} MB", file_len as f64 / (1024.0 * 1024.0))
            };

            let content_desc = if ext == "svg" {
                let svg_str = String::from_utf8_lossy(&content_bytes);
                let snippet: String = svg_str.chars().take(1500).collect();
                format!(
                    "[SVG 이미지: {file_name}]\n형식: SVG 벡터 이미지\n크기: {formatted_size}\n경로: {display_path}\n미리보기 태그:\n{snippet}"
                )
            } else {
                format!(
                    "[이미지 파일: {file_name}]\n형식: {}\n크기: {formatted_size}\n경로: {display_path}",
                    ext.to_uppercase()
                )
            };

            vec![super::code_chunker::CodeChunk {
                start_line: 1,
                end_line: 1,
                symbol: format!("[이미지] {file_name}"),
                content: content_desc,
                lang: "image".to_string(),
            }]
        } else if is_video {
            let file_len = content_bytes.len();
            let formatted_size = if file_len < 1024 {
                format!("{} B", file_len)
            } else if file_len < 1024 * 1024 {
                format!("{:.1} KB", file_len as f64 / 1024.0)
            } else {
                format!("{:.1} MB", file_len as f64 / (1024.0 * 1024.0))
            };

            let content_desc = format!(
                "[동영상 미디어 파일: {file_name}]\n형식: {} 비디오 미디어\n크기: {formatted_size}\n경로: {display_path}",
                ext.to_uppercase()
            );

            vec![super::code_chunker::CodeChunk {
                start_line: 1,
                end_line: 1,
                symbol: format!("[동영상] {file_name}"),
                content: content_desc,
                lang: "video".to_string(),
            }]
        } else if is_office_doc {
            let file_len = content_bytes.len();
            let formatted_size = if file_len < 1024 {
                format!("{} B", file_len)
            } else if file_len < 1024 * 1024 {
                format!("{:.1} KB", file_len as f64 / 1024.0)
            } else {
                format!("{:.1} MB", file_len as f64 / (1024.0 * 1024.0))
            };

            let doc_type = match ext.as_str() {
                "doc" | "docx" => "Word 문서",
                "ppt" | "pptx" => "PowerPoint 발표 문서",
                "xls" | "xlsx" => "Excel 스프레드시트",
                "hwp" | "hwpx" => "한글(HWP) 문서",
                _ => "오피스 문서",
            };

            let content_desc = format!(
                "[{doc_type}: {file_name}]\n형식: {}\n크기: {formatted_size}\n경로: {display_path}",
                ext.to_uppercase()
            );

            vec![super::code_chunker::CodeChunk {
                start_line: 1,
                end_line: 1,
                symbol: format!("[문서] {file_name}"),
                content: content_desc,
                lang: "document".to_string(),
            }]
        } else if ext == "pdf" {
            PdfParser::parse_pdf(path).unwrap_or_default()
        } else {
            let content_str = String::from_utf8_lossy(&content_bytes);
            match ext.as_str() {
                "py" | "ipynb" | "cpp" | "hpp" | "c" | "h" | "cc" | "rs" => {
                    CodeChunker::chunk_file(path, &content_str).unwrap_or_default()
                }
                "md" | "markdown" | "txt" | "csv" | "log" | "rtf" | "json" | "toml" | "yaml" | "yml" | "xml" => {
                    TextExtractor::extract_chunks(&content_str, &ext).unwrap_or_default()
                }
                _ => {
                    CodeChunker::chunk_generic(&content_str, &ext).unwrap_or_default()
                }
            }
        };

        let chunks = if chunks.is_empty() {
            vec![super::code_chunker::CodeChunk {
                start_line: 1,
                end_line: 1,
                symbol: format!("[빈 문서] {file_name}"),
                content: format!("[비어 있는 문서: {file_name}]\n형식: {}\n경로: {display_path}", ext.to_uppercase()),
                lang: ext.clone(),
            }]
        } else {
            chunks
        };

        // Prepare 14-column database chunks
        let mut db_chunks = Vec::new();
        for (chunk_idx, c) in chunks.into_iter().enumerate() {
            let id = format!("{:016x}_{}", xxhash_rust::xxh3::xxh3_64(format!("{normalized}_{chunk_idx}").as_bytes()), chunk_idx);
            let embed_input = Embedder::format_embedding_input(&file_name, &c.symbol, &c.content);
            let vector = self.embedder.embed(&embed_input).await?;

            db_chunks.push(DbChunk {
                id,
                file_path: normalized.clone(),
                display_path: display_path.clone(),
                file_name: file_name.clone(),
                ext: ext.clone(),
                lang: c.lang,
                symbol: c.symbol,
                start_line: c.start_line,
                end_line: c.end_line,
                chunk_index: chunk_idx as u32,
                content: c.content,
                file_hash: file_hash.clone(),
                mtime,
                vector,
            });
        }

        self.db.upsert_chunks_memory(db_chunks).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_index_all_up_to_date() {
        let base_dir = crate::core::config::get_default_base_dir();
        let conf_data = crate::core::config::AppConfig::load_from_dir(&base_dir).unwrap();
        let conf = Arc::new(tokio::sync::RwLock::new(conf_data.clone()));
        let db = Arc::new(crate::core::db::VectorDatabase::new(conf_data.storage.lancedb_dir.clone()));
        let _ = db.load().await;
        let embedder = Arc::new(Embedder::new(&conf_data.inference.device, conf_data.inference.vector_dim));
        let governor = Arc::new(ResourceGovernor::new(
            conf_data.resource_governor.max_cpu_percent,
            conf_data.resource_governor.max_ram_percent,
            conf_data.resource_governor.enabled,
        ));
        let indexer = Indexer::new(conf, db, embedder, governor);

        // First run: ensure all files are indexed
        let _ = indexer.index_all(None, false, None).await.unwrap();

        // Second run: MUST be 0 files because everything is up-to-date!
        let (tx, mut rx) = mpsc::channel::<IndexProgress>(100);
        let h = tokio::spawn(async move {
            let mut list = Vec::new();
            while let Some(p) = rx.recv().await {
                list.push(p);
            }
            list
        });

        let total = indexer.index_all(None, false, Some(tx)).await.unwrap();
        let events = h.await.unwrap();
        println!(">>> test_index_all_up_to_date second run: total_indexed = {}, events = {}", total, events.len());
        assert_eq!(total, 0);
        assert_eq!(events.last().map(|e| e.stage.as_str()), Some("complete"));
    }
}

