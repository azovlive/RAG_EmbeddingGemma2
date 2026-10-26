use std::sync::Arc;
use tauri::State;
use crate::core::config::KnowledgeBundle;
use crate::core::bundle::preset_to_extensions;
use crate::AppState;

#[tauri::command]
pub async fn list_bundles(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<KnowledgeBundle>, String> {
    let conf = state.config.read().await;
    Ok(conf.bundles.clone())
}

#[tauri::command]
pub async fn save_bundle(
    state: State<'_, Arc<AppState>>,
    bundle: KnowledgeBundle,
) -> Result<(), String> {
    let mut conf = state.config.write().await;
    
    // Automatically add bundle paths to target_paths if not already covered
    conf.ensure_bundle_paths(&bundle);

    if let Some(pos) = conf.bundles.iter().position(|b| b.id == bundle.id) {
        conf.bundles[pos] = bundle;
    } else {
        conf.bundles.push(bundle);
    }

    conf.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_bundle(
    state: State<'_, Arc<AppState>>,
    bundle_id: String,
) -> Result<(), String> {
    let mut conf = state.config.write().await;
    conf.bundles.retain(|b| b.id != bundle_id);
    conf.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_preset_extensions(preset: String) -> Result<Vec<String>, String> {
    Ok(preset_to_extensions(&preset))
}
