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

#[tauri::command]
pub fn close_app(app: tauri::AppHandle) {
    app.exit(0);
}
