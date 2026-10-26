use std::sync::Arc;
use tauri::State;
use crate::core::db::{SearchResult, SimilarFileResult, DbChunk};
use crate::core::bundle::normalize_path_for_query;
use crate::AppState;

#[tauri::command]
pub async fn search_query(
    state: State<'_, Arc<AppState>>,
    query: String,
    bundle_id: Option<String>,
    top_k: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let k = top_k.unwrap_or(20);
    let q_vec = state.embedder.embed(&query).await.map_err(|e| e.to_string())?;

    let mut path_filters = Vec::new();
    let mut ext_filters = Vec::new();

    if let Some(b_id) = bundle_id {
        if b_id != "all" {
            let conf = state.config.read().await;
            if let Some(b) = conf.bundles.iter().find(|b| b.id == b_id) {
                path_filters = b.paths.iter().map(|p| normalize_path_for_query(p)).collect();
                ext_filters = b.extensions.clone();
            }
        }
    }

    state.db.search_vectors(&q_vec, &path_filters, &ext_filters, k)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_similar_files(
    state: State<'_, Arc<AppState>>,
    file_path: String,
    top_k: Option<usize>,
) -> Result<Vec<SimilarFileResult>, String> {
    let k = top_k.unwrap_or(8);
    state.db.get_similar_files(&file_path, k)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_file_context(
    state: State<'_, Arc<AppState>>,
    file_path: String,
    start_line: Option<u32>,
    end_line: Option<u32>,
    padding: Option<u32>,
) -> Result<String, String> {
    state.db.get_file_context(
        &file_path,
        start_line.unwrap_or(1),
        end_line.unwrap_or(100),
        padding.unwrap_or(10),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_file_chunks(
    state: State<'_, Arc<AppState>>,
    file_path: String,
) -> Result<Vec<DbChunk>, String> {
    Ok(state.db.get_chunks_for_file(&file_path).await)
}
