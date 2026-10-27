pub mod core;
pub mod commands;
pub mod cli;

use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::{Manager, WindowEvent};

use crate::core::config::{AppConfig, get_default_base_dir};
use crate::core::db::VectorDatabase;
use crate::core::embedder::Embedder;
use crate::core::resource_governor::ResourceGovernor;
use crate::core::indexer::Indexer;
use crate::core::daemon_ipc::DaemonIpcServer;
use crate::core::tray_service::setup_tray;

pub struct AppState {
    pub config: Arc<RwLock<AppConfig>>,
    pub db: Arc<VectorDatabase>,
    pub embedder: Arc<Embedder>,
    pub governor: Arc<ResourceGovernor>,
    pub indexer: Arc<Indexer>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    let base_dir = get_default_base_dir();
    let config_data = AppConfig::load_from_dir(&base_dir).unwrap_or_default();
    let config = Arc::new(RwLock::new(config_data.clone()));

    let db_dir = config_data.storage.lancedb_dir.clone();
    let db = Arc::new(VectorDatabase::new(db_dir));

    let embedder = Arc::new(Embedder::new(
        &config_data.inference.device,
        config_data.inference.vector_dim,
    ));

    let governor = Arc::new(ResourceGovernor::new(
        config_data.resource_governor.max_cpu_percent,
        config_data.resource_governor.max_ram_percent,
        config_data.resource_governor.enabled,
    ));

    let indexer = Arc::new(Indexer::new(
        config.clone(),
        db.clone(),
        embedder.clone(),
        governor.clone(),
    ));

    let db_for_load = db.clone();

    let state = Arc::new(AppState {
        config: config.clone(),
        db: db.clone(),
        embedder: embedder.clone(),
        governor: governor.clone(),
        indexer: indexer.clone(),
    });

    // Start background IPC server on Tokio
    let ipc_db = db.clone();
    let ipc_embedder = embedder.clone();
    let ipc_config = config.clone();
    tauri::async_runtime::spawn(async move {
        let ipc_server = DaemonIpcServer::new(ipc_db, ipc_embedder, ipc_config);
        ipc_server.run().await;
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .setup(move |app| {
            let _ = setup_tray(&app.handle())?;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let db_async = db_for_load.clone();
            tauri::async_runtime::spawn(async move {
                let _ = db_async.load().await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                // Exit application completely when user clicks 'X'
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            crate::commands::search_cmd::search_query,
            crate::commands::search_cmd::get_similar_files,
            crate::commands::search_cmd::get_file_context,
            crate::commands::search_cmd::get_file_chunks,
            crate::commands::bundle_cmd::list_bundles,
            crate::commands::bundle_cmd::save_bundle,
            crate::commands::bundle_cmd::delete_bundle,
            crate::commands::bundle_cmd::get_preset_extensions,
            crate::commands::config_cmd::get_app_config,
            crate::commands::config_cmd::save_app_config,
            crate::commands::config_cmd::add_target_folder,
            crate::commands::config_cmd::add_target_folders,
            crate::commands::config_cmd::get_available_drives,
            crate::commands::config_cmd::get_target_folders_status,
            crate::commands::config_cmd::remove_target_folder,
            crate::commands::config_cmd::check_first_run,
            crate::commands::system_cmd::get_system_status,
            crate::commands::system_cmd::get_image_data,
            crate::commands::system_cmd::open_file_default,
            crate::commands::system_cmd::reveal_in_explorer,
            crate::commands::system_cmd::open_in_editor,
            crate::commands::system_cmd::minimize_window,
            crate::commands::system_cmd::toggle_maximize_window,
            crate::commands::system_cmd::start_dragging_window,
            crate::commands::system_cmd::exit_app,
            crate::commands::system_cmd::get_npu_preference,
            crate::commands::system_cmd::set_npu_preference,
            crate::commands::index_cmd::trigger_indexing,
            crate::commands::index_cmd::pause_indexing,
            crate::commands::index_cmd::resume_indexing,
            crate::commands::index_cmd::cancel_indexing,
            crate::commands::index_cmd::get_indexing_state,
            crate::commands::index_cmd::get_indexing_progress,
            crate::commands::index_cmd::get_index_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
