use std::sync::Arc;
use std::path::PathBuf;
use tauri::State;
use crate::core::config::{AppConfig, TargetFolder};
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
pub async fn add_target_folder(
    state: State<'_, Arc<AppState>>,
    name: String,
    path_str: String,
) -> Result<(), String> {
    let path = PathBuf::from(&path_str);
    if !path.exists() {
        return Err(format!("경로가 존재하지 않습니다: {}", path_str));
    }

    let mut conf = state.config.write().await;
    if !conf.indexing.target_paths.iter().any(|t| t.path == path) {
        conf.indexing.target_paths.push(TargetFolder {
            name,
            path,
            enabled: true,
        });
        conf.save().map_err(|e| e.to_string())?;
    }
    Ok(())
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
