use std::sync::Arc;
use std::path::PathBuf;
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::core::config::AppConfig;
use crate::core::path_helper::{
    get_available_drives as sys_get_available_drives,
    validate_and_apply_targets,
    DriveInfo, FolderAddInput, TargetProcessReport,
};
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetFolderStatus {
    pub name: String,
    pub path: String,
    pub is_drive: bool,
    pub status: String, // "completed" | "indexing" | "pending"
    pub chunk_count: usize,
    pub file_count: usize,
    pub enabled: bool,
}

#[tauri::command]
pub async fn get_app_config(
    state: State<'_, Arc<AppState>>,
) -> Result<AppConfig, String> {
    let conf = state.config.read().await;
    Ok(conf.clone())
}

#[tauri::command]
pub async fn save_app_config(
    state: State<'_, Arc<AppState>>,
    new_config: AppConfig,
) -> Result<(), String> {
    let mut conf = state.config.write().await;
    *conf = new_config;
    conf.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_available_drives(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<DriveInfo>, String> {
    let conf = state.config.read().await;
    Ok(sys_get_available_drives(&conf.indexing.target_paths))
}

#[tauri::command]
pub async fn get_target_folders_status(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<TargetFolderStatus>, String> {
    let conf = state.config.read().await;
    let is_running = state.indexer.is_currently_running();
    let active_folder = state.indexer.get_active_folder().await;

    let mut results = Vec::new();

    for tf in &conf.indexing.target_paths {
        let path_str = tf.path.to_string_lossy().to_string();
        let norm_str = path_str.replace('\\', "/").to_lowercase();
        let is_drive = (norm_str.len() == 3 && norm_str.chars().nth(1) == Some(':') && norm_str.ends_with('/'))
            || norm_str == "/"
            || (norm_str.len() == 2 && norm_str.chars().nth(1) == Some(':'));

        let prefix_with_slash = if norm_str.ends_with('/') {
            norm_str.clone()
        } else {
            format!("{}/", norm_str)
        };

        let (file_count, chunk_count) = state.db.get_folder_stats(&path_str).await;

        let is_folder_indexing = if is_running {
            match &active_folder {
                Some(active) => {
                    let active_norm = active.replace('\\', "/").to_lowercase();
                    active_norm == norm_str || active_norm.starts_with(&prefix_with_slash)
                }
                None => true, // All folders are indexing
            }
        } else {
            false
        };

        let status = if is_folder_indexing {
            "indexing".to_string()
        } else if chunk_count > 0 {
            "completed".to_string()
        } else {
            "pending".to_string()
        };

        results.push(TargetFolderStatus {
            name: tf.name.clone(),
            path: tf.path.to_string_lossy().to_string(),
            is_drive,
            status,
            chunk_count,
            file_count,
            enabled: tf.enabled,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn add_target_folders(
    state: State<'_, Arc<AppState>>,
    inputs: Vec<FolderAddInput>,
) -> Result<TargetProcessReport, String> {
    let mut conf = state.config.write().await;
    let report = validate_and_apply_targets(&mut conf.indexing.target_paths, inputs);
    conf.save().map_err(|e| e.to_string())?;
    Ok(report)
}

#[tauri::command]
pub async fn add_target_folder(
    state: State<'_, Arc<AppState>>,
    name: String,
    path_str: String,
) -> Result<TargetProcessReport, String> {
    let input = FolderAddInput {
        name: Some(name),
        path: path_str,
    };
    add_target_folders(state, vec![input]).await
}

#[tauri::command]
pub async fn remove_target_folder(
    state: State<'_, Arc<AppState>>,
    path_str: String,
) -> Result<(), String> {
    let path = PathBuf::from(&path_str);
    let mut conf = state.config.write().await;
    conf.indexing.target_paths.retain(|t| t.path != path);
    conf.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn check_first_run(
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let conf = state.config.read().await;
    // If target_paths is empty, prompt setup wizard
    Ok(conf.indexing.target_paths.is_empty())
}
