use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
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

pub fn spawn_shell(
    store: PtyStore,
    session_id: String,
    shell: String,
    cols: u16,
    rows: u16,
    channel: Channel<Vec<u8>>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    // Prefer pwsh.exe (PowerShell 7+, ships with PSReadLine 2.2+) over powershell.exe (5.1)
    let resolved_shell = if shell.to_lowercase() == "powershell.exe" {
        if has_pwsh() { "pwsh.exe".to_string() } else { shell.clone() }
    } else {
        shell.clone()
    };

    let mut cmd = CommandBuilder::new(&resolved_shell);
    if resolved_shell.to_lowercase().contains("cmd") {
        cmd.args(["/c", "chcp 65001 >nul && cmd"]);
    } else if resolved_shell.to_lowercase().contains("powershell") || resolved_shell.to_lowercase().contains("pwsh") {
        cmd.args([
            "-NoLogo",
            "-NoExit",
            "-Command",
            "try { Set-PSReadLineOption -PredictionSource History -PredictionViewStyle ListView } catch {}",
        ]);
    }
    cmd.env("TERM", "xterm-256color");

    pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let master = Arc::new(Mutex::new(pair.master));
    let writer = Arc::new(Mutex::new(writer));

    let session = PtySession { writer: writer.clone(), master: master.clone() };
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
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

pub fn close_pty(store: &PtyStore, session_id: &str) {
    store.lock().unwrap().remove(session_id);
}
