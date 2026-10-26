use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};
use tracing::info;

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<TrayIcon<R>, tauri::Error> {
    let open_item = MenuItem::with_id(app, "open", "대시보드 열기", true, None::<&str>)?;
    let index_item = MenuItem::with_id(app, "index_now", "지금 색인 시작", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_item, &index_item, &quit_item])?;

    let icon = match app.default_window_icon() {
        Some(icon) => icon.clone(),
        None => {
            // 32x32 RGBA fallback icon for macOS NSStatusBar & Windows System Tray safety
            let mut rgba = Vec::with_capacity(32 * 32 * 4);
            for _ in 0..(32 * 32) {
                rgba.extend_from_slice(&[56, 189, 248, 255]);
            }
            tauri::image::Image::new_owned(rgba, 32, 32)
        }
    };

    let tray = TrayIconBuilder::with_id("eg2-rag-tray")
        .tooltip("eg2-rag (대기 중 | 색인 준비 완료)")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "open" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "index_now" => {
                    info!("Tray menu triggered re-indexing");
                    let _ = app.emit("tray-trigger-index", ());
                }
                "quit" => {
                    info!("Tray menu exit selected");
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(tray)
}

pub fn update_tray_status<R: Runtime>(tray: &TrayIcon<R>, message: &str) {
    let tooltip = format!("eg2-rag: {}", message);
    let _ = tray.set_tooltip(Some(tooltip));
}
