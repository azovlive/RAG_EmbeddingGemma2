use std::sync::Arc;
use std::path::PathBuf;
use tauri::State;
use crate::core::config::AppConfig;
use crate::core::path_helper::{
    get_available_drives as sys_get_available_drives,
    validate_and_apply_targets,
    DriveInfo, FolderAddInput, TargetProcessReport,
};
use crate::AppState;

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
