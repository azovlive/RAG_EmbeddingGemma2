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

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageDataResponse {
    pub data_url: String,
    pub file_size: u64,
    pub formatted_size: String,
    pub mime_type: String,
    pub ext: String,
}

#[tauri::command]
pub async fn get_image_data(file_path: String) -> Result<ImageDataResponse, String> {
    use base64::prelude::*;
    let path = std::path::Path::new(&file_path);
    if !path.is_file() {
        return Err(format!("파일이 존재하지 않습니다: {}", file_path));
    }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mime_type = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        "avif" => "image/avif",
        _ => return Err(format!("지원되지 않는 이미지 포맷입니다: .{}", ext)),
    };

    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let file_size = metadata.len();
    let formatted_size = if file_size < 1024 {
        format!("{} B", file_size)
    } else if file_size < 1024 * 1024 {
        format!("{:.1} KB", file_size as f64 / 1024.0)
    } else {
        format!("{:.1} MB", file_size as f64 / (1024.0 * 1024.0))
    };

    if file_size > 50 * 1024 * 1024 {
        return Err("50MB를 초과하는 대용량 이미지는 미리보기를 지원하지 않습니다.".to_string());
    }

    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let encoded = BASE64_STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime_type, encoded);

    Ok(ImageDataResponse {
        data_url,
        file_size,
        formatted_size,
        mime_type: mime_type.to_string(),
        ext,
    })
}

#[tauri::command]
pub async fn open_file_default(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", file_path));
    }
    let _ = Command::new("cmd")
        .args(&["/C", "start", "", &file_path])
        .spawn()
        .map_err(|e| format!("기본 뷰어 실행 실패: {}", e))?;
    Ok(())
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
pub async fn minimize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_maximize_window(window: tauri::WebviewWindow) -> Result<bool, String> {
    let is_max = window.is_maximized().unwrap_or(false);
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub async fn start_dragging_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
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
