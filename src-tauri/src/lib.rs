mod commands;
mod services;

use commands::pty::{close_app, close_pty_cmd, create_pty, get_git_branch, init_pty_store, minimize_window, resize_pty_cmd, toggle_maximize, write_pty_cmd};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(init_pty_store())
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_pty_cmd,
            resize_pty_cmd,
            close_pty_cmd,
            close_app,
            minimize_window,
            toggle_maximize,
            get_git_branch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
