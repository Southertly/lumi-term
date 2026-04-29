mod commands;
mod services;

use commands::pty::{close_app, close_pty_cmd, create_pty, drag_window, get_git_branch, init_pty_store, list_workspace_children, list_workspace_roots, minimize_window, resize_pty_cmd, toggle_maximize, validate_workspace_path, write_pty_cmd};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::thread::spawn(|| { services::pty_service::prewarm_shell_detection(); });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(init_pty_store())
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_pty_cmd,
            resize_pty_cmd,
            close_pty_cmd,
            close_app,
            drag_window,
            minimize_window,
            toggle_maximize,
            get_git_branch,
            validate_workspace_path,
            list_workspace_roots,
            list_workspace_children
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
