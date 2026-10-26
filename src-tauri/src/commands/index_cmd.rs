use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use crate::core::indexer::IndexProgress;
use crate::AppState;

#[tauri::command]
pub async fn trigger_indexing(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
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

        if let Err(e) = indexer.index_all(Some(tx)).await {
            tracing::error!("Indexing failed: {:?}", e);
            let _ = app_handle.emit("index-error", e.to_string());
        } else {
            tracing::info!("Indexing finished successfully");
            let _ = app_handle.emit("index-complete", ());
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_index_count(
    state: State<'_, Arc<AppState>>,
) -> Result<usize, String> {
    Ok(state.db.get_total_chunks().await)
}
