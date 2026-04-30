use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::ipc::Channel;

static HAS_PWSH: OnceLock<bool> = OnceLock::new();

pub fn prewarm_shell_detection() {
    let _ = has_pwsh();
}

fn has_pwsh() -> bool {
    *HAS_PWSH.get_or_init(|| {
        std::process::Command::new("pwsh.exe")
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    })
}

pub struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
}

pub type PtyStore = Arc<Mutex<HashMap<String, PtySession>>>;

pub fn create_pty_store() -> PtyStore {
    Arc::new(Mutex::new(HashMap::new()))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub extension: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TextFilePayload {
    pub path: String,
    pub name: String,
    pub content: String,
}

pub const MAX_TEXT_FILE_BYTES: usize = 1024 * 1024;

pub fn validate_workspace_directory(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("workspace path is empty".to_string());
    }

    let normalized = trimmed.strip_prefix("/?/").unwrap_or(trimmed);
    let path = Path::new(normalized);
    if !path.exists() {
        return Err(format!("workspace path does not exist: {}", trimmed));
    }
    if !path.is_dir() {
        return Err(format!("workspace path is not a directory: {}", trimmed));
    }

    path.canonicalize()
        .map_err(|e| format!("failed to resolve workspace path {}: {}", trimmed, e))
}

pub fn canonicalize_working_directory(cwd: &str) -> Result<PathBuf, String> {
    validate_workspace_directory(cwd)
}

pub fn shell_working_directory(cwd: &str) -> Result<PathBuf, String> {
    validate_workspace_directory(cwd).map(|path| PathBuf::from(display_path(&path)))
}

pub fn display_working_directory(cwd: &str) -> Result<String, String> {
    canonicalize_working_directory(cwd).map(|path| display_path(&path))
}

pub fn list_workspace_root_entries() -> Result<Vec<WorkspaceEntry>, String> {
    #[cfg(windows)]
    {
        let mut entries = Vec::new();
        for letter in b'A'..=b'Z' {
            let name = format!("{}:", letter as char);
            let path = format!("{}\\", name);
            if Path::new(&path).is_dir() {
                entries.push(WorkspaceEntry {
                    name,
                    path,
                    kind: "drive".to_string(),
                });
            }
        }
        Ok(entries)
    }

    #[cfg(not(windows))]
    {
        Ok(vec![WorkspaceEntry {
            name: "/".to_string(),
            path: "/".to_string(),
            kind: "drive".to_string(),
        }])
    }
}

pub fn list_workspace_children_entries(path: String) -> Result<Vec<WorkspaceEntry>, String> {
    let root = validate_workspace_directory(&path)?;
    let mut entries = Vec::new();

    for entry in fs::read_dir(root)
        .map_err(|e| format!("failed to read workspace directory {}: {}", path, e))?
    {
        let Ok(entry) = entry else { continue };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        let path = display_path(&entry.path());
        entries.push(WorkspaceEntry {
            name,
            path,
            kind: "folder".to_string(),
        });
    }

    entries.sort_by_key(|entry| entry.name.to_lowercase());
    Ok(entries)
}

pub fn list_directory_entries(path: String) -> Result<Vec<FileEntry>, String> {
    let root = validate_workspace_directory(&path)?;
    let mut entries = Vec::new();

    for entry in
        fs::read_dir(&root).map_err(|e| format!("failed to read directory {}: {}", path, e))?
    {
        let Ok(entry) = entry else { continue };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        let kind = if file_type.is_dir() { "folder" } else { "file" };
        let entry_path = entry.path();
        let extension = if kind == "file" {
            entry_path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase()
        } else {
            String::new()
        };

        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: display_path(&entry_path),
            kind: kind.to_string(),
            extension,
        });
    }

    entries.sort_by(|a, b| match (a.kind == "folder", b.kind == "folder") {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

fn canonicalize_text_file(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("text file path is empty".to_string());
    }

    let normalized = trimmed.strip_prefix("/?/").unwrap_or(trimmed);
    let path = Path::new(normalized);
    if !path.exists() {
        return Err(format!("text file path does not exist: {}", trimmed));
    }
    if !path.is_file() {
        return Err(format!("text file path is not a file: {}", trimmed));
    }

    path.canonicalize()
        .map_err(|e| format!("failed to resolve text file path {}: {}", trimmed, e))
}

pub fn read_text_file(path: String) -> Result<TextFilePayload, String> {
    let file_path = canonicalize_text_file(&path)?;
    let metadata = fs::metadata(&file_path)
        .map_err(|e| format!("failed to read file metadata {}: {}", path, e))?;
    if metadata.len() > MAX_TEXT_FILE_BYTES as u64 {
        return Err(format!("file is too large: {} bytes", metadata.len()));
    }

    let bytes =
        fs::read(&file_path).map_err(|e| format!("failed to read text file {}: {}", path, e))?;
    let content = String::from_utf8(bytes).map_err(|_| "file is not valid UTF-8".to_string())?;
    let name = file_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    Ok(TextFilePayload {
        path: display_path(&file_path),
        name,
        content,
    })
}

pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    if content.len() > MAX_TEXT_FILE_BYTES {
        return Err(format!("content is too large: {} bytes", content.len()));
    }

    let file_path = canonicalize_text_file(&path)?;
    fs::write(&file_path, content).map_err(|e| format!("failed to write text file {}: {}", path, e))
}

const MAX_SEARCH_RESULTS: usize = 200;
const MAX_SEARCH_DEPTH: usize = 8;

pub fn search_files(root_path: &str, query: &str) -> Result<Vec<FileEntry>, String> {
    let root = validate_workspace_directory(root_path)?;
    let query_lower = query.trim().to_lowercase();
    if query_lower.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    walk_search(&root, &query_lower, 0, &mut results);
    Ok(results)
}

fn walk_search(dir: &Path, query: &str, depth: usize, results: &mut Vec<FileEntry>) {
    if depth > MAX_SEARCH_DEPTH || results.len() >= MAX_SEARCH_RESULTS {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if results.len() >= MAX_SEARCH_RESULTS {
            return;
        }

        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let is_dir = file_type.is_dir();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.to_lowercase().contains(query) {
            let entry_path = entry.path();
            let extension = if !is_dir {
                entry_path
                    .extension()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase()
            } else {
                String::new()
            };

            results.push(FileEntry {
                name,
                path: display_path(&entry_path),
                kind: if is_dir { "folder" } else { "file" }.to_string(),
                extension,
            });
        }

        if is_dir {
            walk_search(&entry.path(), query, depth + 1, results);
        }
    }
}

pub fn create_file(parent_path: &str, name: &str) -> Result<String, String> {
    let parent = validate_workspace_directory(parent_path)?;
    let file_path = parent.join(name);
    if file_path.exists() {
        return Err(format!("文件已存在: {}", name));
    }
    fs::File::create(&file_path).map_err(|e| format!("创建文件失败: {}", e))?;
    Ok(display_path(&file_path))
}

pub fn create_folder(parent_path: &str, name: &str) -> Result<String, String> {
    let parent = validate_workspace_directory(parent_path)?;
    let dir_path = parent.join(name);
    if dir_path.exists() {
        return Err(format!("文件夹已存在: {}", name));
    }
    fs::create_dir(&dir_path).map_err(|e| format!("创建文件夹失败: {}", e))?;
    Ok(display_path(&dir_path))
}

pub fn rename_path(old_path: &str, new_name: &str) -> Result<String, String> {
    let old = Path::new(old_path.trim());
    if !old.exists() {
        return Err("路径不存在".to_string());
    }
    let parent = old.parent().ok_or("无法获取父目录")?;
    let new_path = parent.join(new_name);
    if new_path.exists() {
        return Err(format!("目标已存在: {}", new_name));
    }
    fs::rename(old, &new_path).map_err(|e| format!("重命名失败: {}", e))?;
    Ok(display_path(&new_path))
}

pub fn delete_path(path: &str) -> Result<(), String> {
    let target = Path::new(path.trim());
    if !target.exists() {
        return Err("路径不存在".to_string());
    }
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|e| format!("删除文件夹失败: {}", e))?;
    } else {
        fs::remove_file(target).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    Ok(())
}

fn display_path(path: &Path) -> String {
    let display = path.display().to_string();
    display
        .strip_prefix(r"\\?\")
        .or_else(|| display.strip_prefix(r"//?/"))
        .unwrap_or(&display)
        .to_string()
}

fn path_for_cmd(path: &Path) -> String {
    display_path(path).replace('\\', "/")
}

fn cmd_cwd_init_input(path: &Path) -> Vec<u8> {
    let path = path_for_cmd(path);
    let drive_command = path
        .as_bytes()
        .get(1)
        .filter(|&&byte| byte == b':')
        .map(|_| format!("{}\r\n", &path[..2]))
        .unwrap_or_default();
    format!("{}cd /d \"{}\"\r\ncls\r\n", drive_command, path).into_bytes()
}

fn build_shell_command(shell: &str, _cwd: Option<&Path>) -> (String, Vec<String>) {
    let is_cmd = shell.to_lowercase().contains("cmd");
    let resolved_shell = if is_cmd {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else if shell.to_lowercase() == "powershell.exe" {
        if has_pwsh() {
            "pwsh.exe".to_string()
        } else {
            shell.to_string()
        }
    } else {
        shell.to_string()
    };

    let args = if is_cmd {
        let command = "chcp 65001 >nul".to_string();
        vec!["/d".to_string(), "/k".to_string(), command]
    } else if resolved_shell.to_lowercase().contains("powershell")
        || resolved_shell.to_lowercase().contains("pwsh")
    {
        vec![
            "-NoLogo".to_string(),
            "-NoExit".to_string(),
            "-Command".to_string(),
            "try { Set-PSReadLineOption -PredictionSource History -PredictionViewStyle ListView } catch {}".to_string(),
        ]
    } else {
        Vec::new()
    };

    (resolved_shell, args)
}

pub fn spawn_shell(
    store: PtyStore,
    session_id: String,
    shell: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    channel: Channel<Vec<u8>>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let working_directory = match cwd {
        Some(cwd) => Some(shell_working_directory(&cwd)?),
        None => None,
    };
    let cmd_init_input = if shell.to_lowercase().contains("cmd") {
        working_directory.as_deref().map(cmd_cwd_init_input)
    } else {
        None
    };
    let (resolved_shell, shell_args) = build_shell_command(&shell, working_directory.as_deref());
    let mut cmd = CommandBuilder::new(&resolved_shell);
    if let Some(path) = working_directory {
        cmd.cwd(path);
    }
    if !shell_args.is_empty() {
        cmd.args(shell_args);
    }
    cmd.env("TERM", "xterm-256color");

    pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let master = Arc::new(Mutex::new(pair.master));
    let writer = Arc::new(Mutex::new(writer));
    if let Some(input) = cmd_init_input {
        writer
            .lock()
            .unwrap()
            .write_all(&input)
            .map_err(|e| e.to_string())?;
    }

    let session = PtySession {
        writer: writer.clone(),
        master: master.clone(),
    };
    store.lock().unwrap().insert(session_id, session);

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if channel.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    Ok(())
}

pub fn write_pty(store: &PtyStore, session_id: &str, data: Vec<u8>) -> Result<(), String> {
    let writer = {
        let store = store.lock().unwrap();
        let session = store.get(session_id).ok_or("session not found")?;
        session.writer.clone()
    };
    let mut writer_guard = writer.lock().unwrap();
    writer_guard.write_all(&data).map_err(|e| e.to_string())
}

pub fn resize_pty(store: &PtyStore, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let master = {
        let store = store.lock().unwrap();
        let session = store.get(session_id).ok_or("session not found")?;
        session.master.clone()
    };
    let master_guard = master.lock().unwrap();
    master_guard
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

pub fn close_pty(store: &PtyStore, session_id: &str) {
    store.lock().unwrap().remove(session_id);
}

#[cfg(test)]
mod tests {
    use super::{
        build_shell_command, canonicalize_working_directory, cmd_cwd_init_input, display_path,
        display_working_directory, list_directory_entries, list_workspace_children_entries,
        list_workspace_root_entries, path_for_cmd, read_text_file, shell_working_directory,
        validate_workspace_directory, write_text_file, MAX_TEXT_FILE_BYTES,
    };
    use std::fs;
    use std::path::Path;

    #[test]
    fn canonicalizes_existing_working_directory() {
        let cwd = std::env::current_dir().unwrap();
        let with_trailing_separator = format!("{}{}", cwd.display(), std::path::MAIN_SEPARATOR);

        let canonical = canonicalize_working_directory(&with_trailing_separator).unwrap();

        assert_eq!(canonical, cwd.canonicalize().unwrap());
    }

    #[test]
    fn shell_working_directory_hides_long_path_prefix() {
        let cwd = std::env::current_dir().unwrap();
        let shell_cwd = shell_working_directory(&cwd.to_string_lossy()).unwrap();

        assert!(!shell_cwd.display().to_string().starts_with(r"\\?\"));
        assert!(!shell_cwd.display().to_string().starts_with(r"//?/"));
    }

    #[test]
    fn rejects_missing_working_directory() {
        let missing = std::env::temp_dir().join(format!(
            "lumiterm-missing-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));

        let error = canonicalize_working_directory(&missing.to_string_lossy()).unwrap_err();

        assert!(error.contains("workspace path does not exist"));
    }

    #[test]
    fn validates_existing_workspace_directory() {
        let cwd = std::env::current_dir().unwrap();

        let canonical = validate_workspace_directory(&cwd.to_string_lossy()).unwrap();

        assert_eq!(canonical, cwd.canonicalize().unwrap());
    }

    #[test]
    fn validates_slash_question_mark_windows_namespace_path() {
        let cwd = std::env::current_dir().unwrap();
        let path = cwd.to_string_lossy().replace('\\', "/");

        let canonical = validate_workspace_directory(&format!("/?/{}", path)).unwrap();

        assert_eq!(canonical, cwd.canonicalize().unwrap());
    }

    #[test]
    fn rejects_file_as_workspace_directory() {
        let root = std::env::temp_dir().join(format!(
            "lumiterm-file-workspace-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("not-a-folder.txt");
        fs::write(&file, "not a directory").unwrap();

        let error = validate_workspace_directory(&file.to_string_lossy()).unwrap_err();

        assert!(error.contains("workspace path is not a directory"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_empty_workspace_directory() {
        let error = validate_workspace_directory("   ").unwrap_err();

        assert_eq!(error, "workspace path is empty");
    }

    #[test]
    #[cfg(windows)]
    fn lists_drive_names_without_trailing_separator() {
        let entries = list_workspace_root_entries().unwrap();

        assert!(entries.iter().all(|entry| entry.kind == "drive"));
        assert!(entries.iter().all(|entry| !entry.name.ends_with('\\')));
        assert!(entries.iter().all(|entry| entry.path.ends_with('\\')));
    }

    #[test]
    fn cmd_shell_uses_keep_open_flag_so_cwd_is_preserved() {
        let (shell, args) = build_shell_command("cmd.exe", None);

        assert!(shell.to_lowercase().ends_with("cmd.exe"));
        assert_eq!(args, vec!["/d", "/k", "chcp 65001 >nul"]);
    }

    #[test]
    fn strips_long_path_prefix_for_display() {
        let path = Path::new(r"\\?\E:\claudecode");

        assert_eq!(display_path(path), r"E:\claudecode");
    }

    #[test]
    fn display_working_directory_hides_long_path_prefix() {
        let cwd = std::env::current_dir().unwrap();
        let displayed = display_working_directory(&cwd.to_string_lossy()).unwrap();

        assert!(!displayed.starts_with(r"\\?\"));
        assert!(!displayed.starts_with(r"//?/"));
    }

    #[test]
    fn strips_long_path_prefix_for_cmd_cd() {
        let path = Path::new(r"\\?\E:\claudecode\.agents");

        assert_eq!(path_for_cmd(path), "E:/claudecode/.agents");
    }

    #[test]
    fn cmd_cwd_init_input_switches_drive_then_directory() {
        let path = Path::new("D:\\BaiduNetdiskDownload");

        assert_eq!(
            cmd_cwd_init_input(path),
            b"D:\r\ncd /d \"D:/BaiduNetdiskDownload\"\r\ncls\r\n".to_vec()
        );
    }

    #[test]
    fn cmd_shell_keeps_startup_args_independent_from_cwd() {
        let cwd = Path::new("D:\\CloudMusic");

        let (shell, args) = build_shell_command("cmd.exe", Some(cwd));

        assert!(shell.to_lowercase().ends_with("cmd.exe"));
        assert_eq!(args, vec!["/d", "/k", "chcp 65001 >nul"]);
    }

    #[test]
    fn lists_child_directories_without_files() {
        let root = std::env::temp_dir().join(format!(
            "lumiterm-workspace-children-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("folder-a")).unwrap();
        fs::create_dir_all(root.join("folder-b")).unwrap();
        fs::write(root.join("file.txt"), "ignored").unwrap();

        let entries = list_workspace_children_entries(root.to_string_lossy().to_string()).unwrap();
        let names: Vec<_> = entries.iter().map(|entry| entry.name.as_str()).collect();

        assert_eq!(names, vec!["folder-a", "folder-b"]);
        assert!(entries.iter().all(|entry| entry.kind == "folder"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn list_directory_returns_files_and_folders() {
        let root = std::env::temp_dir().join(format!(
            "lumiterm-list-dir-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("subfolder")).unwrap();
        fs::write(root.join("readme.md"), "# Hello").unwrap();
        fs::write(root.join("main.rs"), "fn main() {}").unwrap();

        let entries = list_directory_entries(root.to_string_lossy().to_string()).unwrap();
        let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();

        assert_eq!(names, vec!["subfolder", "main.rs", "readme.md"]);
        assert_eq!(entries[0].kind, "folder");
        assert_eq!(entries[0].extension, "");
        assert_eq!(entries[1].kind, "file");
        assert_eq!(entries[1].extension, "rs");
        assert_eq!(entries[2].extension, "md");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn list_directory_sorts_folders_first() {
        let root = std::env::temp_dir().join(format!(
            "lumiterm-list-dir-sort-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("zzz-folder")).unwrap();
        fs::write(root.join("aaa-file.txt"), "").unwrap();
        fs::create_dir_all(root.join("aaa-folder")).unwrap();

        let entries = list_directory_entries(root.to_string_lossy().to_string()).unwrap();
        let kinds: Vec<_> = entries.iter().map(|e| e.kind.as_str()).collect();

        assert_eq!(kinds, vec!["folder", "folder", "file"]);
        assert_eq!(entries[0].name, "aaa-folder");
        assert_eq!(entries[1].name, "zzz-folder");
        assert_eq!(entries[2].name, "aaa-file.txt");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reads_utf8_text_file() {
        let root = std::env::temp_dir().join(format!(
            "lumiterm-read-text-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("hello.txt");
        fs::write(&file, "hello 你好").unwrap();

        let payload = read_text_file(file.to_string_lossy().to_string()).unwrap();

        assert_eq!(payload.path, display_path(&file.canonicalize().unwrap()));
        assert_eq!(payload.name, "hello.txt");
        assert_eq!(payload.content, "hello 你好");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_directory_as_text_file() {
        let root = std::env::temp_dir().join(format!(
            "lumiterm-text-dir-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();

        let error = read_text_file(root.to_string_lossy().to_string()).unwrap_err();

        assert!(error.contains("path is not a file"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_missing_text_file() {
        let missing = std::env::temp_dir().join(format!(
            "lumiterm-missing-text-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));

        let error = read_text_file(missing.to_string_lossy().to_string()).unwrap_err();

        assert!(error.contains("text file path does not exist"));
    }

    #[test]
    fn rejects_large_text_file() {
        let root = std::env::temp_dir().join(format!(
            "lumiterm-large-text-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("large.txt");
        fs::write(&file, vec![b'a'; MAX_TEXT_FILE_BYTES + 1]).unwrap();

        let error = read_text_file(file.to_string_lossy().to_string()).unwrap_err();

        assert!(error.contains("file is too large"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_invalid_utf8_text_file() {
        let root = std::env::temp_dir().join(format!(
            "lumiterm-invalid-utf8-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("invalid.txt");
        fs::write(&file, [0xff, 0xfe, 0xfd]).unwrap();

        let error = read_text_file(file.to_string_lossy().to_string()).unwrap_err();

        assert!(error.contains("file is not valid UTF-8"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn writes_utf8_text_file() {
        let root = std::env::temp_dir().join(format!(
            "lumiterm-write-text-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("write.txt");
        fs::write(&file, "old").unwrap();

        write_text_file(file.to_string_lossy().to_string(), "new 你好".to_string()).unwrap();

        assert_eq!(fs::read_to_string(&file).unwrap(), "new 你好");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_large_text_write() {
        let root = std::env::temp_dir().join(format!(
            "lumiterm-large-write-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("write.txt");
        fs::write(&file, "old").unwrap();

        let error = write_text_file(
            file.to_string_lossy().to_string(),
            "a".repeat(MAX_TEXT_FILE_BYTES + 1),
        )
        .unwrap_err();

        assert!(error.contains("content is too large"));
        assert_eq!(fs::read_to_string(&file).unwrap(), "old");
        fs::remove_dir_all(root).unwrap();
    }
}
