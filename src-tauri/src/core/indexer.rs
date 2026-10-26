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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexProgress {
    pub current_file: String,
    pub processed_files: usize,
    pub total_files: usize,
    pub percent: f32,
    pub is_paused: bool,
}

pub struct Indexer {
    pub config: Arc<tokio::sync::RwLock<AppConfig>>,
    pub db: Arc<VectorDatabase>,
    pub embedder: Arc<Embedder>,
    pub governor: Arc<ResourceGovernor>,
    pub is_paused: Arc<AtomicBool>,
    pub is_running: Arc<AtomicBool>,
    pub is_cancelled: Arc<AtomicBool>,
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

    pub async fn index_all(
        &self,
        target_folder: Option<String>,
        force: bool,
        progress_tx: Option<mpsc::Sender<IndexProgress>>,
    ) -> Result<usize> {
        self.is_running.store(true, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst);
        self.is_cancelled.store(false, Ordering::SeqCst);

        // If force re-index, clear corresponding DB chunks first
        if force {
            if let Some(ref folder) = target_folder {
                let norm = normalize_path_for_query(Path::new(folder));
                let _ = self.db.clear_folder(&norm).await;
            } else {
                let _ = self.db.clear_all().await;
            }
        }

        let conf = self.config.read().await.clone();
        let mut all_files = Vec::new();

        // 1. Collect all target files
        let search_dirs: Vec<std::path::PathBuf> = if let Some(ref folder) = target_folder {
            vec![std::path::PathBuf::from(folder)]
        } else {
            conf.indexing
                .target_paths
                .iter()
                .filter(|t| t.enabled && t.path.exists())
                .map(|t| t.path.clone())
                .collect()
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

                    all_files.push(path);
                }
            }
        }

        let total = all_files.len();

        // Send initial progress immediately so UI updates with 0% right away
        if let Some(ref tx) = progress_tx {
            let _ = tx.send(IndexProgress {
                current_file: if total > 0 { "색인 시작 중...".to_string() } else { "색인 대상 파일 없음 (0개)".to_string() },
                processed_files: 0,
                total_files: total,
                percent: 0.0,
                is_paused: false,
            }).await;
        }

        // If 0 files found, finish cleanly
        if total == 0 {
            self.is_running.store(false, Ordering::SeqCst);
            self.is_paused.store(false, Ordering::SeqCst);
            return Ok(0);
        }

        // 2. Process files with Read-Only guarantee & Resource Governor
        for (idx, file_path) in all_files.into_iter().enumerate() {
            // Check User Cancel
            if self.is_cancelled.load(Ordering::SeqCst) {
                tracing::info!("Indexing cancelled by user at file {}/{}", idx, total);
                self.is_running.store(false, Ordering::SeqCst);
                self.is_paused.store(false, Ordering::SeqCst);
                self.is_cancelled.store(false, Ordering::SeqCst);
                let _ = self.db.persist().await;
                return Ok(idx);
            }

            // Check User Manual Pause
            while self.is_paused.load(Ordering::SeqCst) {
                if self.is_cancelled.load(Ordering::SeqCst) {
                    self.is_running.store(false, Ordering::SeqCst);
                    self.is_paused.store(false, Ordering::SeqCst);
                    self.is_cancelled.store(false, Ordering::SeqCst);
                    let _ = self.db.persist().await;
                    return Ok(idx);
                }
                if let Some(ref tx) = progress_tx {
                    let _ = tx.send(IndexProgress {
                        current_file: file_path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
                        processed_files: idx,
                        total_files: total,
                        percent: if total > 0 { (idx as f32 / total as f32) * 100.0 } else { 100.0 },
                        is_paused: true,
                    }).await;
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
            }

            // Check Resource Governor
            let (_, _, should_pause) = self.governor.check_system().await;
            if should_pause {
                if let Some(ref tx) = progress_tx {
                    let _ = tx.send(IndexProgress {
                        current_file: file_path.to_string_lossy().to_string(),
                        processed_files: idx,
                        total_files: total,
                        percent: if total > 0 { (idx as f32 / total as f32) * 100.0 } else { 100.0 },
                        is_paused: true,
                    }).await;
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
            }

            let _ = self.index_single_file(&file_path, force).await;

            // Batch persist every 20 files to prevent disk write bottlenecks
            if (idx + 1) % 20 == 0 {
                let _ = self.db.persist().await;
            }

            if let Some(ref tx) = progress_tx {
                let _ = tx.send(IndexProgress {
                    current_file: file_path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
                    processed_files: idx + 1,
                    total_files: total,
                    percent: if total > 0 { ((idx + 1) as f32 / total as f32) * 100.0 } else { 100.0 },
                    is_paused: false,
                }).await;
            }
        }

        // Final persist of all accumulated chunks
        let _ = self.db.persist().await;

        self.is_running.store(false, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst);

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
            PdfParser::parse_pdf(path)?
        } else {
            let content_str = String::from_utf8_lossy(&content_bytes);
            match ext.as_str() {
                "py" | "ipynb" | "cpp" | "hpp" | "c" | "h" | "cc" | "rs" => {
                    CodeChunker::chunk_file(path, &content_str)?
                }
                "md" | "markdown" | "txt" | "csv" | "log" | "rtf" | "json" | "toml" | "yaml" | "yml" | "xml" => {
                    TextExtractor::extract_chunks(&content_str, &ext)?
                }
                _ => {
                    CodeChunker::chunk_generic(&content_str, &ext)?
                }
            }
        };

        if chunks.is_empty() {
            return Ok(());
        }

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
