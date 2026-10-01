use serde::Serialize;
use std::fs;
use std::path::Path;

/// Arquivos maiores que isso não são lidos como texto.
const MAX_TEXT_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Serialize)]
struct PathInfo {
    exists: bool,
    is_dir: bool,
    size: u64,
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    is_dir: bool,
    size: u64,
}

/// Lê um arquivo de texto (UTF-8, bytes inválidos substituídos). Recusa binários e pastas.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("Não foi possível abrir {path}: {e}"))?;
    if meta.is_dir() {
        return Err(format!("{path} é uma pasta; use list_directory."));
    }
    if meta.len() > MAX_TEXT_BYTES {
        return Err(format!("{path} é grande demais ({} MB).", meta.len() / 1_048_576));
    }
    let bytes = fs::read(&path).map_err(|e| format!("Falha ao ler {path}: {e}"))?;
    if bytes.iter().take(8000).any(|b| *b == 0) {
        return Err(format!("{path} é um arquivo binário."));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Cria ou sobrescreve um arquivo (criando as pastas). Retorna true se ele já existia.
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<bool, String> {
    let p = Path::new(&path);
    let existed = p.exists();
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("Falha ao criar a pasta {}: {e}", parent.display()))?;
        }
    }
    fs::write(p, content.as_bytes()).map_err(|e| format!("Falha ao gravar {path}: {e}"))?;
    Ok(existed)
}

#[tauri::command]
fn path_info(path: String) -> PathInfo {
    match fs::metadata(&path) {
        Ok(m) => PathInfo { exists: true, is_dir: m.is_dir(), size: m.len() },
        Err(_) => PathInfo { exists: false, is_dir: false, size: 0 },
    }
}

/// Lista uma pasta (sem recursão), pastas primeiro e em ordem alfabética.
#[tauri::command]
fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| format!("Não foi possível listar {path}: {e}"))? {
        let Ok(entry) = entry else { continue };
        let Ok(meta) = entry.metadata() else { continue };
        out.push(DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
        });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_http::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_shell::init());

    builder
        .invoke_handler(tauri::generate_handler![read_text_file, write_text_file, path_info, read_dir])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Severo");
}
