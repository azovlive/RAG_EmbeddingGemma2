use std::sync::Arc;
use std::process::Command;
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatus {
    pub cpu_usage: f32,
    pub ram_usage: f32,
    pub is_throttled: bool,
    pub total_chunks: usize,
}

#[tauri::command]
pub async fn get_system_status(
    state: State<'_, Arc<AppState>>,
) -> Result<SystemStatus, String> {
    let (cpu, ram, throttled) = state.governor.check_system().await;
    let total = state.db.get_total_chunks().await;
    Ok(SystemStatus {
        cpu_usage: (cpu * 10.0).round() / 10.0,
        ram_usage: (ram * 10.0).round() / 10.0,
        is_throttled: throttled,
        total_chunks: total,
    })
}

#[tauri::command]
pub async fn reveal_in_explorer(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", file_path));
    }

    let win_path = file_path.replace('/', "\\");
    let status = Command::new("explorer.exe")
        .arg(format!("/select,\"{}\"", win_path))
        .spawn();

    match status {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("탐색기 실행 실패: {}", e)),
    }
}

#[tauri::command]
pub async fn open_in_editor(file_path: String, line: Option<u32>) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", file_path));
    }

    // Try VS Code first if available
    let line_arg = match line {
        Some(l) => format!("--goto {}:{}", file_path, l),
        None => file_path.clone(),
    };

    let vscode = Command::new("cmd")
        .args(&["/C", &format!("code {}", line_arg)])
        .spawn();

    if vscode.is_err() {
        // Fallback to default system opener
        let _ = Command::new("cmd")
            .args(&["/C", "start", "", &file_path])
            .spawn();
    }

    Ok(())
}

#[tauri::command]
pub async fn exit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn get_npu_preference(
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    Ok(state.embedder.get_device() == "npu")
}

#[tauri::command]
pub async fn set_npu_preference(
    state: State<'_, Arc<AppState>>,
    prefer_npu: bool,
) -> Result<bool, String> {
    let device = if prefer_npu { "npu" } else { "cpu" };
    state.embedder.set_device(device);

    let mut conf = state.config.write().await;
    conf.inference.device = device.to_string();
    let _ = conf.save();

    Ok(prefer_npu)
}
