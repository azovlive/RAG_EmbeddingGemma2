use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbChunk {
    pub id: String,
    pub file_path: String,
    pub display_path: String,
    pub file_name: String,
    pub ext: String,
    pub lang: String,
    pub symbol: String,
    pub start_line: u32,
    pub end_line: u32,
    pub chunk_index: u32,
    pub content: String,
    pub file_hash: String,
    pub mtime: i64,
    pub vector: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub chunk: DbChunk,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarFileResult {
    pub display_path: String,
    pub file_name: String,
    pub ext: String,
    pub score: f32,
}

pub struct VectorDatabase {
    pub db_dir: PathBuf,
    chunks: Arc<RwLock<Vec<DbChunk>>>,
}

impl VectorDatabase {
    pub fn new(db_dir: PathBuf) -> Self {
        Self {
            db_dir,
            chunks: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn load(&self) -> Result<()> {
        let file = self.db_dir.join("chunks_store.json");
        if file.exists() {
            let data = std::fs::read_to_string(file)?;
            let list: Vec<DbChunk> = serde_json::from_str(&data)?;
            let mut lock = self.chunks.write().await;
            *lock = list;
        }
        Ok(())
    }

    pub async fn persist(&self) -> Result<()> {
        std::fs::create_dir_all(&self.db_dir)?;
        let file = self.db_dir.join("chunks_store.json");
        let lock = self.chunks.read().await;
        let data = serde_json::to_string(&*lock)?;
        std::fs::write(file, data)?;
        Ok(())
    }

    pub async fn upsert_chunks(&self, new_chunks: Vec<DbChunk>) -> Result<()> {
        self.upsert_chunks_memory(new_chunks).await;
        self.persist().await?;
        Ok(())
    }

    pub async fn upsert_chunks_memory(&self, new_chunks: Vec<DbChunk>) {
        let mut lock = self.chunks.write().await;
        for new_c in new_chunks {
            if let Some(pos) = lock.iter().position(|c| c.id == new_c.id) {
                lock[pos] = new_c;
            } else {
                lock.push(new_c);
            }
        }
    }

    pub async fn delete_by_file_path(&self, normalized_path: &str) -> Result<()> {
        let mut lock = self.chunks.write().await;
        lock.retain(|c| c.file_path != normalized_path);
        drop(lock);
        self.persist().await?;
        Ok(())
    }

    pub async fn clear_all(&self) -> Result<()> {
        let mut lock = self.chunks.write().await;
        lock.clear();
        drop(lock);
        self.persist().await?;
        Ok(())
    }

    pub async fn clear_folder(&self, folder_prefix: &str) -> Result<()> {
        let mut lock = self.chunks.write().await;
        let prefix = folder_prefix.replace('\\', "/").to_lowercase();
        lock.retain(|c| {
            let p = c.file_path.replace('\\', "/").to_lowercase();
            !p.starts_with(&prefix)
        });
        drop(lock);
        self.persist().await?;
        Ok(())
    }

    pub async fn get_existing_hash(&self, normalized_path: &str) -> Option<String> {
        let lock = self.chunks.read().await;
        lock.iter().find(|c| c.file_path == normalized_path).map(|c| c.file_hash.clone())
    }

    pub async fn get_total_chunks(&self) -> usize {
        let lock = self.chunks.read().await;
        lock.len()
    }

    pub async fn search_vectors(
        &self,
        query_vec: &[f32],
        bundle_path_prefixes: &[String],
        allowed_exts: &[String],
        top_k: usize,
    ) -> Result<Vec<SearchResult>> {
        let lock = self.chunks.read().await;
        let mut scored: Vec<SearchResult> = Vec::new();

        for chunk in lock.iter() {
            // Check bundle path filter
            if !bundle_path_prefixes.is_empty() {
                let matched = bundle_path_prefixes.iter().any(|prefix| chunk.file_path.starts_with(prefix));
                if !matched {
                    continue;
                }
            }

            // Check extension filter
            if !allowed_exts.is_empty() {
                let ext_match = allowed_exts.iter().any(|e| e.eq_ignore_ascii_case(&chunk.ext));
                if !ext_match {
                    continue;
                }
            }

            // Compute cosine similarity: since vectors are L2-normalized, dot product is cosine similarity
            let dot_product: f32 = chunk.vector.iter().zip(query_vec.iter()).map(|(&a, &b)| a * b).sum();
            // Scale to 0.0 ~ 1.0 percentage
            let sim = ((dot_product + 1.0) / 2.0).clamp(0.0, 1.0);

            scored.push(SearchResult {
                chunk: chunk.clone(),
                score: sim,
            });
        }

        // Sort by similarity descending
        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(top_k);

        Ok(scored)
    }

    pub async fn get_chunks_for_file(&self, file_path: &str) -> Vec<DbChunk> {
        let lock = self.chunks.read().await;
        lock.iter()
            .filter(|c| c.file_path == file_path || c.display_path == file_path)
            .cloned()
            .collect()
    }

    pub async fn get_file_context(
        &self,
        display_path: &str,
        start_line: u32,
        end_line: u32,
        padding: u32,
    ) -> Result<String> {
        // Enforce safe Read-Only access: reads original file on disk without writing
        let path = Path::new(display_path);
        if path.exists() {
            let content = std::fs::read_to_string(path)?;
            let lines: Vec<&str> = content.lines().collect();

            let target_start = (start_line.saturating_sub(padding)).max(1) as usize;
            let target_end = ((end_line + padding) as usize).min(lines.len());

            if target_start <= lines.len() {
                let slice = &lines[(target_start - 1)..target_end];
                return Ok(slice.join("\n"));
            }
        }

        // Fallback to DB stored content
        let lock = self.chunks.read().await;
        let matched = lock.iter().find(|c| c.display_path == display_path && c.start_line == start_line);
        if let Some(m) = matched {
            Ok(m.content.clone())
        } else {
            Ok(String::new())
        }
    }

    pub async fn get_similar_files(&self, display_path: &str, top_k: usize) -> Result<Vec<SimilarFileResult>> {
        let lock = self.chunks.read().await;
        let target_chunks: Vec<&DbChunk> = lock.iter().filter(|c| c.display_path == display_path).collect();
        if target_chunks.is_empty() {
            return Ok(Vec::new());
        }

        // Compute average vector of target file
        let dim = target_chunks[0].vector.len();
        let mut avg_vector = vec![0.0f32; dim];
        for c in &target_chunks {
            for (idx, v) in c.vector.iter().enumerate() {
                avg_vector[idx] += v;
            }
        }
        let count = target_chunks.len() as f32;
        for v in &mut avg_vector {
            *v /= count;
        }
        super::embedder::Embedder::l2_normalize(&mut avg_vector);

        let mut file_scores: std::collections::HashMap<String, (String, String, f32)> = std::collections::HashMap::new();

        for chunk in lock.iter() {
            if chunk.display_path == display_path {
                continue;
            }

            let dot: f32 = chunk.vector.iter().zip(avg_vector.iter()).map(|(&a, &b)| a * b).sum();
            let score = ((dot + 1.0) / 2.0).clamp(0.0, 1.0);

            let entry = file_scores.entry(chunk.display_path.clone()).or_insert((chunk.file_name.clone(), chunk.ext.clone(), 0.0));
            if score > entry.2 {
                entry.2 = score;
            }
        }

        let mut results: Vec<SimilarFileResult> = file_scores.into_iter().map(|(path, (name, ext, score))| {
            SimilarFileResult {
                display_path: path,
                file_name: name,
                ext,
                score,
            }
        }).collect();

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(top_k);

        Ok(results)
    }
}
