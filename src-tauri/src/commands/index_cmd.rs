use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use serde::{Deserialize, Serialize};
use crate::core::indexer::IndexProgress;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct IndexingState {
    pub is_running: bool,
    pub is_paused: bool,
    pub total_chunks: usize,
}

#[tauri::command]
pub async fn trigger_indexing(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    target_folder: Option<String>,
    force: Option<bool>,
) -> Result<(), String> {
    let force_reindex = force.unwrap_or(false);

    if state.indexer.is_currently_running() {
        if !force_reindex && state.indexer.is_currently_paused() {
            state.indexer.resume();
            return Ok(());
        }
        if !force_reindex {
            return Ok(());
        }
        // If force re-index is requested while another index is running, cleanly cancel the previous one first
        state.indexer.cancel();
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
    }

    let indexer = state.indexer.clone();
    let app_handle = app.clone();

    tokio::spawn(async move {
        let (tx, mut rx) = mpsc::channel::<IndexProgress>(100);

        let app_emit = app_handle.clone();
        tokio::spawn(async move {
            while let Some(prog) = rx.recv().await {
                let _ = app_emit.emit("index-progress", &prog);
            }
        });

        match indexer.index_all(target_folder, force_reindex, Some(tx)).await {
            Ok(total_processed) => {
                tracing::info!("Indexing finished successfully. Total: {}", total_processed);
                let _ = app_handle.emit("index-complete", total_processed);
            }
            Err(e) => {
                tracing::error!("Indexing failed: {:?}", e);
                let _ = app_handle.emit("index-error", e.to_string());
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn pause_indexing(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.indexer.pause();
    Ok(())
}

#[tauri::command]
pub async fn resume_indexing(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    if state.indexer.is_currently_running() {
        state.indexer.resume();
        return Ok(());
    }
    trigger_indexing(app, state, None, Some(false)).await
}

#[tauri::command]
pub async fn cancel_indexing(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.indexer.cancel();
    Ok(())
}

#[tauri::command]
pub async fn get_indexing_state(
    state: State<'_, Arc<AppState>>,
) -> Result<IndexingState, String> {
    let is_running = state.indexer.is_currently_running();
    let is_paused = if is_running {
        state.indexer.is_currently_paused()
    } else {
        false
    };
    Ok(IndexingState {
        is_running,
        is_paused,
        total_chunks: state.db.get_total_chunks().await,
    })
}

#[tauri::command]
pub async fn get_indexing_progress(
    state: State<'_, Arc<AppState>>,
) -> Result<IndexProgress, String> {
    let prog = state.indexer.current_progress.read().await.clone();
    Ok(prog)
}

#[tauri::command]
pub async fn get_index_count(
    state: State<'_, Arc<AppState>>,
) -> Result<usize, String> {
    Ok(state.db.get_total_chunks().await)
}
