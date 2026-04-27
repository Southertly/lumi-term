use crate::services::pty_service::{close_pty, create_pty_store, resize_pty, spawn_shell, write_pty, PtyStore};
use tauri::ipc::Channel;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn create_pty(
    store: State<PtyStore>,
    shell: String,
    cols: u16,
    rows: u16,
    channel: Channel<Vec<u8>>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    spawn_shell(store.inner().clone(), session_id.clone(), shell, cols, rows, channel)?;
    Ok(session_id)
}

#[tauri::command]
pub fn write_pty_cmd(store: State<PtyStore>, session_id: String, data: Vec<u8>) -> Result<(), String> {
    write_pty(store.inner(), &session_id, data)
}

#[tauri::command]
pub fn resize_pty_cmd(store: State<PtyStore>, session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    resize_pty(store.inner(), &session_id, cols, rows)
}

#[tauri::command]
pub fn close_pty_cmd(store: State<PtyStore>, session_id: String) {
    close_pty(store.inner(), &session_id);
}

pub fn init_pty_store() -> PtyStore {
    create_pty_store()
}

/// Exits the application. Called by the frontend when the last terminal tab is closed.
#[tauri::command]
pub fn close_app(store: State<PtyStore>, app: tauri::AppHandle) -> Result<(), String> {
    if let Ok(mut s) = store.lock() {
        s.clear();
    } else {
        eprintln!("[close_app] Warning: Failed to acquire PTY store lock, skipping cleanup");
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn drag_window(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn get_git_branch(path: String) -> String {
    // Validate path is an existing directory before spawning git
    if !std::path::Path::new(&path).is_dir() {
        return String::new();
    }
    let result = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .current_dir(&path)
            .output()
    })
    .await;

    match result {
        Ok(Ok(output)) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => String::new(),
    }
}
