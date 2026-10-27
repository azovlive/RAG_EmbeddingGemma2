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

    pub fn load_sync(&self) -> Result<()> {
        let file = self.db_dir.join("chunks_store.json");
        if file.exists() {
            let data = std::fs::read_to_string(file)?;
            let list: Vec<DbChunk> = serde_json::from_str(&data)?;
            if let Ok(mut lock) = self.chunks.try_write() {
                *lock = list;
            }
        }
        Ok(())
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

    pub async fn get_folder_stats(&self, prefix: &str) -> (usize, usize) {
        let lock = self.chunks.read().await;
        let p = prefix.replace('\\', "/").trim_end_matches('/').to_lowercase();
        let prefix_with_slash = if p.is_empty() {
            "/".to_string()
        } else {
            format!("{}/", p)
        };
        let mut file_set = std::collections::HashSet::new();
        let mut chunk_count = 0;

        for c in lock.iter() {
            let cf = c.file_path.replace('\\', "/").to_lowercase();
            if cf.starts_with(&prefix_with_slash) || cf == p {
                chunk_count += 1;
                file_set.insert(cf);
            }
        }
        (file_set.len(), chunk_count)
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
        let p = folder_prefix.replace('\\', "/").trim_end_matches('/').to_lowercase();
        let prefix_with_slash = if p.is_empty() {
            "/".to_string()
        } else {
            format!("{}/", p)
        };
        lock.retain(|c| {
            let cf = c.file_path.replace('\\', "/").to_lowercase();
            !(cf.starts_with(&prefix_with_slash) || cf == p)
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
                let cf = chunk.file_path.replace('\\', "/").to_lowercase();
                let matched = bundle_path_prefixes.iter().any(|prefix| {
                    let p = prefix.replace('\\', "/").trim_end_matches('/').to_lowercase();
                    let p_slash = if p.is_empty() { "/".to_string() } else { format!("{}/", p) };
                    cf.starts_with(&p_slash) || cf == p
                });
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
        let norm_target = file_path.replace('\\', "/").to_lowercase();
        lock.iter()
            .filter(|c| {
                c.file_path.replace('\\', "/").to_lowercase() == norm_target
                    || c.display_path.replace('\\', "/").to_lowercase() == norm_target
            })
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
        let norm_target = display_path.replace('\\', "/").to_lowercase();
        let matched = lock.iter().find(|c| {
            (c.display_path == display_path || c.file_path.replace('\\', "/").to_lowercase() == norm_target)
                && c.start_line == start_line
        });
        if let Some(m) = matched {
            Ok(m.content.clone())
        } else {
            Ok(String::new())
        }
    }

    pub async fn get_similar_files(&self, display_path: &str, top_k: usize) -> Result<Vec<SimilarFileResult>> {
        let lock = self.chunks.read().await;
        let norm_target = display_path.replace('\\', "/").to_lowercase();
        let target_chunks: Vec<&DbChunk> = lock.iter().filter(|c| {
            c.file_path.replace('\\', "/").to_lowercase() == norm_target
                || c.display_path.replace('\\', "/").to_lowercase() == norm_target
        }).collect();
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
            let chunk_norm = chunk.file_path.replace('\\', "/").to_lowercase();
            if chunk_norm == norm_target {
                continue; // Skip chunks of the same file
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_get_folder_stats_windows_backslash_and_slash() {
        let temp_dir = std::env::temp_dir().join(format!(
            "eg2_db_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let db = VectorDatabase::new(temp_dir.clone());

        let chunks = vec![
            DbChunk {
                id: "1".to_string(),
                file_path: "c:/users/test/project/main.py".to_string(),
                display_path: r"C:\Users\test\project\main.py".to_string(),
                file_name: "main.py".to_string(),
                ext: "py".to_string(),
                lang: "python".to_string(),
                symbol: "main".to_string(),
                start_line: 1,
                end_line: 10,
                chunk_index: 0,
                content: "def main(): pass".to_string(),
                file_hash: "abc".to_string(),
                mtime: 100,
                vector: vec![0.1; 4],
            },
            DbChunk {
                id: "2".to_string(),
                file_path: "c:/users/test/project/main.py".to_string(),
                display_path: r"C:\Users\test\project\main.py".to_string(),
                file_name: "main.py".to_string(),
                ext: "py".to_string(),
                lang: "python".to_string(),
                symbol: "helper".to_string(),
                start_line: 11,
                end_line: 20,
                chunk_index: 1,
                content: "def helper(): pass".to_string(),
                file_hash: "abc".to_string(),
                mtime: 100,
                vector: vec![0.2; 4],
            },
            DbChunk {
                id: "3".to_string(),
                file_path: "c:/users/test/project_other/other.py".to_string(),
                display_path: r"C:\Users\test\project_other\other.py".to_string(),
                file_name: "other.py".to_string(),
                ext: "py".to_string(),
                lang: "python".to_string(),
                symbol: "other".to_string(),
                start_line: 1,
                end_line: 5,
                chunk_index: 0,
                content: "pass".to_string(),
                file_hash: "def".to_string(),
                mtime: 100,
                vector: vec![0.3; 4],
            },
        ];

        db.upsert_chunks_memory(chunks).await;

        // 1. Windows backslash path must accurately match normalized forward-slash DB paths
        let (files, chunk_cnt) = db.get_folder_stats(r"C:\Users\test\project").await;
        assert_eq!(files, 1);
        assert_eq!(chunk_cnt, 2);

        // 2. Trailing backslash or slash must also match
        let (files2, chunk_cnt2) = db.get_folder_stats(r"C:\Users\test\project\").await;
        assert_eq!(files2, 1);
        assert_eq!(chunk_cnt2, 2);

        // 3. Drive root C:\ must match all 2 files (3 chunks)
        let (files_root, chunks_root) = db.get_folder_stats(r"C:\").await;
        assert_eq!(files_root, 2);
        assert_eq!(chunks_root, 3);

        // 4. clear_folder on C:\Users\test\project must NOT delete C:\Users\test\project_other
        db.clear_folder(r"C:\Users\test\project").await.unwrap();
        let (f_proj, c_proj) = db.get_folder_stats(r"C:\Users\test\project").await;
        assert_eq!(f_proj, 0);
        assert_eq!(c_proj, 0);

        let (f_other, c_other) = db.get_folder_stats(r"C:\Users\test\project_other").await;
        assert_eq!(f_other, 1);
        assert_eq!(c_other, 1);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
