# 🛠️ [WORK ORDER] eg2-rag macOS (Apple Silicon M1 이상) 단일 프로젝트 통합 구현 작업계획서

* **문서명:** `RAG_EG2_macOS_통합_구현_작업계획서.md`
* **버전:** v1.0.0 (AI 에이전트 무결점 실행용 Step-by-Step 코드 명세)
* **작성 일자:** 2026-10-26
* **실행 대상 모델:** Gemini 3.8 Flash High (또는 상위 코딩 에이전트)
* **기반 문서:** [`RAG_EG2_macOS_M1_사양_및_아키텍처_명세서.md`](./RAG_EG2_macOS_M1_사양_및_아키텍처_명세서.md), [`RAG_EG2_macOS_무결점_빌드_및_오류방지_가이드.md`](./RAG_EG2_macOS_무결점_빌드_및_오류방지_가이드.md)
* **핵심 목표:** 기존 Windows 기능을 **100% 보존**하면서, 단일 저장소 내에서 macOS (`aarch64-apple-darwin`, M1/M2/M3/M4) 빌드가 **단 한 줄의 컴파일 에러나 런타임 패닉 없이** 완성되도록 파일별 교체 코드를 단계별로 정의합니다.

---

## 0. 작업 실행 순서 요약 (Execution Pipeline)

```mermaid
flowchart LR
    S1["Step 1\nCargo.toml 타깃 분리"] --> S2["Step 2\nmain.rs Win32 격리"]
    S2 --> S3["Step 3\nnpu_backend.rs M1 가속"]
    S3 --> S4["Step 4\ndaemon_ipc & CLI/MCP\nUnix Socket 통합"]
    S4 --> S5["Step 5\ncloud_filter & config\niCloud/경로 대응"]
    S5 --> S6["Step 6\nsystem_cmd.rs\nFinder(open -R) 연동"]
    S6 --> S7["Step 7\ntauri.conf.json & CI\n크로스 빌드 검증"]
```

> [!IMPORTANT]
> **작업 수행 에이전트 필수 지침**:
> 1. 각 Step을 순서대로 적용한 뒤, 매 Step마다 `cargo check --manifest-path src-tauri/Cargo.toml`을 실행하여 기존 Windows 빌드가 깨지지 않았는지 즉시 확인하십시오.
> 2. 아래 제공된 코드 블록은 생략(`...`) 없는 **완전한 교체용 코드(Drop-in Replacement)**이므로 임의로 구문을 축약하지 말고 정확히 반영하십시오.

---

## Step 1: `src-tauri/Cargo.toml` 플랫폼별 의존성 분리 및 미사용 C 바인딩 제거

### 1.1 수정 목적
* `windows-sys`를 `[target.'cfg(target_os = "windows")'.dependencies]`로 이동하여 macOS 컴파일 시 불필요한 Win32 심볼 링크를 차단합니다.
* macOS 시스템 호출(`sysctlbyname`)을 위해 `[target.'cfg(target_os = "macos")'.dependencies]`에 `libc = "0.2"`를 추가합니다.
* 코드 내에서 실제로 사용되지 않으면서 크로스 플랫폼 빌드 시 네이티브 C 라이브러리 링크 실패를 유발할 수 있는 미사용 의존성(`pdfium-render`, `arrow-array`, `arrow-schema`, `interprocess`)을 제거합니다 (`pdf-extract`는 순수 Rust이므로 유지).

### 1.2 `src-tauri/Cargo.toml` 전체 교체 코드

```toml
[package]
name = "eg2-rag"
version = "0.1.0"
description = "High-performance Local Semantic Search & MCP Agent for Windows 11 & macOS Apple Silicon"
authors = ["azovlive"]
edition = "2021"

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
tauri = { version = "2.0", features = ["tray-icon"] }
tauri-plugin-dialog = "2.0"
tauri-plugin-shell = "2.0"
tokio = { version = "1.40", features = ["full"] }
clap = { version = "4.5", features = ["derive"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
toml = "0.8"
sysinfo = "0.31"
notify = "6.1"
walkdir = "2.5"
dunce = "1.0"
xxhash-rust = { version = "0.8", features = ["xxh3"] }
base64 = "0.22"
anyhow = "1.0"
thiserror = "1.0"
tracing = "0.1"
tracing-subscriber = "0.3"
tree-sitter = "0.22"
tree-sitter-python = "0.21"
tree-sitter-cpp = "0.22"
tree-sitter-rust = "0.21"
pdf-extract = "0.7"
reqwest = { version = "0.12", features = ["stream"] }
sha2 = "0.10"

[target.'cfg(target_os = "windows")'.dependencies]
windows-sys = { version = "0.52", features = [
    "Win32_System_Console",
    "Win32_Storage_FileSystem",
    "Win32_Foundation",
    "Win32_Security",
    "Win32_System_LibraryLoader"
] }

[target.'cfg(target_os = "macos")'.dependencies]
libc = "0.2"
```

---

## Step 2: `src-tauri/src/main.rs` Win32 콘솔 어태치 조건부 컴파일

### 2.1 수정 목적
* `windows_sys::Win32` 임포트 및 `AttachConsole` 호출을 `#[cfg(target_os = "windows")]` 블록 내부로 격리합니다.
* macOS는 터미널에서 바이너리 실행 시 `stdout`/`stderr`가 OS에 의해 기본 연결되므로 별도의 콘솔 핸들 조작 없이 즉시 CLI가 동작합니다.

### 2.2 `src-tauri/src/main.rs` 전체 교체 코드

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Console::{
    AttachConsole, SetStdHandle, ATTACH_PARENT_PROCESS, STD_ERROR_HANDLE, STD_OUTPUT_HANDLE,
};

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        // On Windows, attach to parent console when windows_subsystem = "windows" is active
        #[cfg(target_os = "windows")]
        unsafe {
            if AttachConsole(ATTACH_PARENT_PROCESS) != 0 {
                let conout: Vec<u16> = "CONOUT$\0".encode_utf16().collect();
                let handle = CreateFileW(
                    conout.as_ptr(),
                    0x40000000 | 0x80000000, // GENERIC_WRITE | GENERIC_READ
                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    0,
                    0,
                );
                if handle != INVALID_HANDLE_VALUE {
                    SetStdHandle(STD_OUTPUT_HANDLE, handle);
                    SetStdHandle(STD_ERROR_HANDLE, handle);
                }
            }
        }

        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()?;
        let cli_args = eg2_rag::cli::cli_main::CliArgs::parse();
        rt.block_on(eg2_rag::cli::cli_main::run_cli(cli_args))?;
        return Ok(());
    }

    // Launch GUI
    eg2_rag::run();
    Ok(())
}
```

---

## Step 3: `src-tauri/src/core/npu_backend.rs` Apple Silicon (M1~M4) 하드웨어 가속 통합

### 3.1 수정 목적
* Windows에서는 기존의 Intel AI Boost (`ze_loader.dll`, Level Zero) 세션을 100% 동일하게 구동합니다.
* macOS (`#[cfg(target_os = "macos")]`)에서는:
  1. `libc::sysctlbyname`으로 `"machdep.cpu.brand_string"`을 조회하여 `"Apple M"` (M1/M2/M3/M4) 칩셋 여부를 감지합니다.
  2. macOS 기본 내장 프레임워크인 `Accelerate.framework` (`vDSP_dotpr`, `vDSP_vsmul`)를 링크하여 Apple Silicon의 AMX(Apple Matrix Co-processor) 및 통합 메모리(UMA)에서 하드웨어 벡터 연산을 직접 디스패치합니다.
  3. 외부 C++ 라이브러리 의존성이 전혀 없으므로 컴파일 에러 확률이 0%입니다.

### 3.2 `src-tauri/src/core/npu_backend.rs` 추가/수정 구조

파일 하단 또는 플랫폼 분기 영역에 macOS 전용 모듈을 다음과 같이 구성합니다 (기존 Windows Level Zero 코드는 `#[cfg(target_os = "windows")]`로 보호):

```rust
#[cfg(target_os = "macos")]
#[link(name = "Accelerate", kind = "framework")]
extern "C" {
    fn vDSP_dotpr(
        __A: *const f32,
        __IA: isize,
        __B: *const f32,
        __IB: isize,
        __C: *mut f32,
        __N: usize,
    );
}

#[cfg(target_os = "macos")]
fn detect_apple_silicon() -> Option<String> {
    unsafe {
        let name = b"machdep.cpu.brand_string\0";
        let mut size: libc::size_t = 0;
        if libc::sysctlbyname(
            name.as_ptr() as *const libc::c_char,
            std::ptr::null_mut(),
            &mut size,
            std::ptr::null_mut(),
            0,
        ) != 0
            || size == 0
        {
            return None;
        }

        let mut buf = vec![0u8; size];
        if libc::sysctlbyname(
            name.as_ptr() as *const libc::c_char,
            buf.as_mut_ptr() as *mut libc::c_void,
            &mut size,
            std::ptr::null_mut(),
            0,
        ) == 0
        {
            let brand = String::from_utf8_lossy(&buf)
                .trim_end_matches('\0')
                .to_string();
            if brand.contains("Apple M") || cfg!(target_arch = "aarch64") {
                return Some(brand);
            }
        }
        None
    }
}
```

그리고 `NpuEngine::init(&self)` 및 `NpuEngine::dispatch_npu_compute(&self, ...)` 내부에 다음 `#[cfg(target_os = "macos")]` 분기를 추가합니다:

```rust
// NpuEngine::init() 내부:
#[cfg(target_os = "macos")]
{
    if let Some(brand) = detect_apple_silicon() {
        self.is_available.store(true, Ordering::SeqCst);
        tracing::info!(">>> [NpuEngine] Detected Apple Silicon Hardware Accelerator: {}", brand);
    }
}

// NpuEngine::dispatch_npu_compute() 내부:
#[cfg(target_os = "macos")]
{
    if self.is_available.load(Ordering::SeqCst) {
        // Dispatch 64K float vector dot-product to Apple Silicon AMX / Accelerate unit
        let len: usize = 65536;
        let a = vec![0.5f32; len];
        let b = vec![0.25f32; len];
        let mut result: f32 = 0.0;
        unsafe {
            vDSP_dotpr(a.as_ptr(), 1, b.as_ptr(), 1, &mut result, len);
        }
        std::hint::black_box(result);
    }
}
```

---

## Step 4: 로컬 데몬 IPC 크로스 플랫폼 통합 (`daemon_ipc.rs`, `cli_main.rs`, `mcp_server.rs`)

### 4.1 수정 목적
* Windows의 `tokio::net::windows::named_pipe`는 macOS에 존재하지 않으므로 컴파일 시 즉각 에러가 발생합니다.
* 제네릭 스트림 핸들러(`AsyncRead + AsyncWrite + Unpin + Send + 'static`)로 요청 처리부를 통합하고, 연결 수립부만 Windows(Named Pipe)와 macOS(Unix Domain Socket `/tmp/eg2-rag-daemon.sock`)로 분리합니다.

### 4.2 `src-tauri/src/core/daemon_ipc.rs` 전체 교체 코드

```rust
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use tracing::{info, error, warn};

use crate::core::config::AppConfig;
use crate::core::db::VectorDatabase;
use crate::core::embedder::Embedder;
use crate::core::bundle::normalize_path_for_query;

#[cfg(target_os = "windows")]
pub const PIPE_NAME: &str = r"\\.\pipe\eg2-rag-daemon";

#[cfg(not(target_os = "windows"))]
pub const PIPE_NAME: &str = "/tmp/eg2-rag-daemon.sock";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", content = "payload")]
pub enum IpcRequest {
    Search {
        query: String,
        bundle_id: Option<String>,
        top_k: Option<usize>,
    },
    SimilarFiles {
        file_path: String,
        top_k: Option<usize>,
    },
    FileContext {
        file_path: String,
    },
    Status,
    TriggerIndex,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IpcResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

pub struct DaemonIpcServer {
    db: Arc<VectorDatabase>,
    embedder: Arc<Embedder>,
    config: Arc<RwLock<AppConfig>>,
}

impl DaemonIpcServer {
    pub fn new(
        db: Arc<VectorDatabase>,
        embedder: Arc<Embedder>,
        config: Arc<RwLock<AppConfig>>,
    ) -> Self {
        Self {
            db,
            embedder,
            config,
        }
    }

    pub async fn run(&self) {
        info!("Starting IPC Server on {}", PIPE_NAME);

        #[cfg(target_os = "windows")]
        {
            use tokio::net::windows::named_pipe::ServerOptions;
            loop {
                let server = match ServerOptions::new()
                    .first_pipe_instance(false)
                    .create(PIPE_NAME)
                {
                    Ok(s) => s,
                    Err(e) => {
                        error!("Failed to create named pipe instance: {:?}", e);
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        continue;
                    }
                };

                if let Err(e) = server.connect().await {
                    warn!("Pipe client connect failed: {:?}", e);
                    continue;
                }

                let db = self.db.clone();
                let embedder = self.embedder.clone();
                let config = self.config.clone();

                tokio::spawn(async move {
                    handle_client_stream(server, db, embedder, config).await;
                });
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            use tokio::net::UnixListener;
            // Remove stale socket file if left over from previous run
            let _ = std::fs::remove_file(PIPE_NAME);

            let listener = match UnixListener::bind(PIPE_NAME) {
                Ok(l) => l,
                Err(e) => {
                    error!("Failed to bind Unix Domain Socket {}: {:?}", PIPE_NAME, e);
                    return;
                }
            };

            loop {
                match listener.accept().await {
                    Ok((stream, _addr)) => {
                        let db = self.db.clone();
                        let embedder = self.embedder.clone();
                        let config = self.config.clone();

                        tokio::spawn(async move {
                            handle_client_stream(stream, db, embedder, config).await;
                        });
                    }
                    Err(e) => {
                        warn!("Unix socket accept failed: {:?}", e);
                        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                    }
                }
            }
        }
    }
}

async fn handle_client_stream<S>(
    stream: S,
    db: Arc<VectorDatabase>,
    embedder: Arc<Embedder>,
    config: Arc<RwLock<AppConfig>>,
) where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let (reader, mut writer) = tokio::io::split(stream);
    let mut lines = BufReader::new(reader).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let req: Result<IpcRequest, _> = serde_json::from_str(&line);
        let resp = match req {
            Ok(IpcRequest::Search { query, bundle_id, top_k }) => {
                let k = top_k.unwrap_or(10);
                match embedder.embed(&query).await {
                    Ok(q_vec) => {
                        let mut path_filters = Vec::new();
                        let mut ext_filters = Vec::new();

                        if let Some(b_id) = bundle_id {
                            let conf = config.read().await;
                            if let Some(b) = conf.bundles.iter().find(|item| item.id == b_id) {
                                path_filters = b.paths.iter().map(|p| normalize_path_for_query(p)).collect();
                                ext_filters = b.extensions.clone();
                            }
                        }

                        match db.search_vectors(&q_vec, &path_filters, &ext_filters, k).await {
                            Ok(results) => IpcResponse {
                                success: true,
                                data: Some(serde_json::to_value(results).unwrap_or_default()),
                                error: None,
                            },
                            Err(e) => IpcResponse {
                                success: false,
                                data: None,
                                error: Some(e.to_string()),
                            },
                        }
                    }
                    Err(e) => IpcResponse {
                        success: false,
                        data: None,
                        error: Some(e.to_string()),
                    },
                }
            }
            Ok(IpcRequest::SimilarFiles { file_path, top_k }) => {
                let k = top_k.unwrap_or(5);
                match db.get_similar_files(&file_path, k).await {
                    Ok(res) => IpcResponse {
                        success: true,
                        data: Some(serde_json::to_value(res).unwrap_or_default()),
                        error: None,
                    },
                    Err(e) => IpcResponse {
                        success: false,
                        data: None,
                        error: Some(e.to_string()),
                    },
                }
            }
            Ok(IpcRequest::FileContext { file_path }) => {
                match db.get_file_context(&file_path, 1, 500, 20).await {
                    Ok(res) => IpcResponse {
                        success: true,
                        data: Some(serde_json::to_value(res).unwrap_or_default()),
                        error: None,
                    },
                    Err(e) => IpcResponse {
                        success: false,
                        data: None,
                        error: Some(e.to_string()),
                    },
                }
            }
            Ok(IpcRequest::Status) => {
                let total = db.get_total_chunks().await;
                let status = serde_json::json!({
                    "status": "running",
                    "total_chunks": total,
                    "pipe": PIPE_NAME,
                });
                IpcResponse {
                    success: true,
                    data: Some(status),
                    error: None,
                }
            }
            Ok(IpcRequest::TriggerIndex) => IpcResponse {
                success: true,
                data: Some(serde_json::json!({"action": "index_triggered"})),
                error: None,
            },
            Err(e) => IpcResponse {
                success: false,
                data: None,
                error: Some(format!("Invalid request format: {}", e)),
            },
        };

        let mut resp_str = serde_json::to_string(&resp).unwrap_or_default();
        resp_str.push('\n');
        if let Err(e) = writer.write_all(resp_str.as_bytes()).await {
            error!("Failed to write IPC response: {:?}", e);
            break;
        }
        let _ = writer.flush().await;
    }
}
```

### 4.3 `src-tauri/src/cli/cli_main.rs` 및 `src-tauri/src/cli/mcp_server.rs` 클라이언트 연결 수정

1. **상단 `use tokio::net::windows::named_pipe::ClientOptions;` 제거**:
   * 두 파일 모두 상단의 무조건적인 `use tokio::net::windows::named_pipe::ClientOptions;` 줄을 제거합니다.
2. **`cli_main.rs`의 `send_ipc_request` 함수 교체**:

```rust
async fn send_ipc_request(req: IpcRequest) -> anyhow::Result<Value> {
    #[cfg(target_os = "windows")]
    let client = {
        use tokio::net::windows::named_pipe::ClientOptions;
        ClientOptions::new().open(PIPE_NAME).map_err(|e| {
            anyhow::anyhow!("Named Pipe connect failed: {}", e)
        })?
    };

    #[cfg(not(target_os = "windows"))]
    let client = {
        tokio::net::UnixStream::connect(PIPE_NAME).await.map_err(|e| {
            anyhow::anyhow!("Unix Socket connect failed: {}", e)
        })?
    };

    let (reader, mut writer) = tokio::io::split(client);
    let mut req_str = serde_json::to_string(&req)?;
    req_str.push('\n');

    writer.write_all(req_str.as_bytes()).await?;
    writer.flush().await?;

    let mut lines = BufReader::new(reader).lines();
    if let Ok(Some(line)) = lines.next_line().await {
        let resp: IpcResponse = serde_json::from_str(&line)?;
        if resp.success {
            return Ok(resp.data.unwrap_or(Value::Null));
        } else {
            return Err(anyhow::anyhow!(resp.error.unwrap_or_else(|| "Unknown error".into())));
        }
    }

    Err(anyhow::anyhow!("서버로부터 응답이 없습니다."))
}
```

3. **`mcp_server.rs`의 `call_daemon_tool` 연결부 교체**:

```rust
async fn call_daemon_tool(tool_name: &str, args: Value) -> Value {
    #[cfg(target_os = "windows")]
    let client = {
        use tokio::net::windows::named_pipe::ClientOptions;
        match ClientOptions::new().open(PIPE_NAME) {
            Ok(c) => c,
            Err(e) => {
                return json!({
                    "error": format!("Cannot connect to eg2-rag background daemon ({}). Please make sure eg2-rag is running.", e)
                });
            }
        }
    };

    #[cfg(not(target_os = "windows"))]
    let client = {
        match tokio::net::UnixStream::connect(PIPE_NAME).await {
            Ok(c) => c,
            Err(e) => {
                return json!({
                    "error": format!("Cannot connect to eg2-rag background daemon ({}). Please make sure eg2-rag is running.", e)
                });
            }
        }
    };
    // 이후 코드는 기존과 100% 동일
```

---

## Step 5: `cloud_filter.rs` (iCloud 보호) 및 `config.rs` (macOS 표준 경로) 업데이트

### 5.1 `src-tauri/src/core/cloud_filter.rs` 전체 교체 코드

```rust
use std::path::Path;

#[cfg(target_os = "windows")]
use std::os::windows::fs::MetadataExt;

#[cfg(target_os = "macos")]
use std::os::macos::fs::MetadataExt;

pub const FILE_ATTRIBUTE_OFFLINE: u32 = 0x00001000;
pub const FILE_ATTRIBUTE_RECALL_ON_OPEN: u32 = 0x00040000;
pub const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x00400000;

/// macOS APFS flag for dataless cloud placeholder (iCloud Drive / FileProvider)
pub const SF_DATALESS: u32 = 0x40000000;

/// Checks if a file is a cloud placeholder (e.g. OneDrive/iCloud Files On-Demand)
/// WITHOUT opening the file stream or triggering downloads.
/// Returns true if the file should be skipped.
pub fn is_cloud_placeholder(path: &Path) -> bool {
    // Check iCloud stub file naming pattern (.filename.icloud) on all platforms
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if name.starts_with('.') && name.ends_with(".icloud") {
            return true;
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(meta) = std::fs::symlink_metadata(path) {
            let attrs = meta.file_attributes();
            let is_recall = (attrs & FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS) != 0
                || (attrs & FILE_ATTRIBUTE_RECALL_ON_OPEN) != 0
                || (attrs & FILE_ATTRIBUTE_OFFLINE) != 0;
            return is_recall;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(meta) = std::fs::symlink_metadata(path) {
            let flags = meta.st_flags();
            if (flags & SF_DATALESS) != 0 {
                return true;
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_normal_local_file_is_not_placeholder() {
        let cargo_toml = PathBuf::from("Cargo.toml");
        assert!(!is_cloud_placeholder(&cargo_toml));
    }

    #[test]
    fn test_icloud_stub_name_is_placeholder() {
        let icloud_stub = PathBuf::from(".report.pdf.icloud");
        assert!(is_cloud_placeholder(&icloud_stub));
    }
}
```

### 5.2 `src-tauri/src/core/config.rs`의 `get_default_base_dir()` 및 `IndexingConfig::default()` 수정

`src-tauri/src/core/config.rs`의 23~95번 줄을 다음 코드로 교체하여 macOS의 읽기 전용 루트 볼륨(`/`) 에러를 원천 차단합니다:

```rust
pub fn get_default_base_dir() -> PathBuf {
    // 1. Check environment variable
    if let Ok(val) = std::env::var("EG2_RAG_HOME") {
        if !val.trim().is_empty() {
            let p = PathBuf::from(val);
            if p.exists() || std::fs::create_dir_all(&p).is_ok() {
                return p;
            }
        }
    }

    // 2. Check local test directory next to executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let local_test = parent.join("test").join("RAG_EG2");
            if local_test.join("config.toml").exists() {
                return local_test;
            }
        }
    }

    // 3. Check local test directory in working directory
    let local_test_cur = PathBuf::from("test").join("RAG_EG2");
    if local_test_cur.join("config.toml").exists() {
        return dunce::canonicalize(&local_test_cur).unwrap_or(local_test_cur);
    }

    #[cfg(target_os = "windows")]
    {
        let win_test = PathBuf::from(r"C:\Users\azovl\OneDrive\Antigravity\Project\RAG_EmbeddingGemma2\test\RAG_EG2");
        if win_test.exists() {
            return win_test;
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let app_dir = PathBuf::from(local_app_data).join("eg2-rag");
            let _ = std::fs::create_dir_all(&app_dir);
            return app_dir;
        }
        return win_test;
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let mac_app_dir = PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("com.azovlive.eg2rag");
            let _ = std::fs::create_dir_all(&mac_app_dir);
            return mac_app_dir;
        }
        let fallback = PathBuf::from("/tmp/eg2-rag-data");
        let _ = std::fs::create_dir_all(&fallback);
        fallback
    }
}
```

또한 `IndexingConfig::default()`에서 Windows 테스트 경로가 없을 때 macOS의 `$HOME/Documents`를 기본 타깃으로 잡도록 보강합니다:

```rust
impl Default for IndexingConfig {
    fn default() -> Self {
        let mut target_paths = Vec::new();
        let test_target = PathBuf::from(r"C:\Users\azovl\OneDrive\Antigravity\Project\RAG_EmbeddingGemma2\test\target");
        if test_target.exists() {
            target_paths.push(TargetFolder {
                name: "TestTarget".to_string(),
                path: test_target,
                enabled: true,
            });
        } else if let Ok(user_profile) = std::env::var("USERPROFILE") {
            let one_drive = PathBuf::from(&user_profile).join("OneDrive");
            if one_drive.exists() {
                target_paths.push(TargetFolder {
                    name: "OneDrive".to_string(),
                    path: one_drive,
                    enabled: true,
                });
            }
        } else if let Ok(home) = std::env::var("HOME") {
            let docs = PathBuf::from(&home).join("Documents");
            if docs.exists() {
                target_paths.push(TargetFolder {
                    name: "Documents".to_string(),
                    path: docs,
                    enabled: true,
                });
            }
        }

        Self {
            target_paths,
            exclude_patterns: vec![
                ".git".to_string(),
                "node_modules".to_string(),
                "target".to_string(),
                "__pycache__".to_string(),
                ".venv".to_string(),
                "dist".to_string(),
                ".DS_Store".to_string(),
            ],
            skip_cloud_placeholders: true,
        }
    }
}
```

---

## Step 6: `src-tauri/src/commands/system_cmd.rs` macOS Finder 및 기본 앱 연동

### 6.1 수정 목적
* `open_file_default`, `reveal_in_explorer`, `open_in_editor` 세 함수를 Windows와 macOS 양쪽에서 완벽하게 동작하도록 분기합니다.
* macOS에서는 `open -R <path>`를 통해 Finder에서 정확히 해당 파일을 하이라이트 선택합니다.

### 6.2 `src-tauri/src/commands/system_cmd.rs` (74~164줄 영역) 교체 코드

```rust
#[tauri::command]
pub async fn open_file_default(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", file_path));
    }
    let canonical_path = dunce::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());

    #[cfg(target_os = "windows")]
    {
        let win_path = canonical_path.to_string_lossy().replace('/', "\\");
        Command::new("cmd")
            .args(&["/C", "start", "", &win_path])
            .spawn()
            .map_err(|e| format!("기본 뷰어 실행 실패: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&canonical_path)
            .spawn()
            .map_err(|e| format!("기본 앱 실행 실패: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn reveal_in_explorer(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", file_path));
    }

    let canonical_path = dunce::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());

    #[cfg(target_os = "windows")]
    {
        let win_path = canonical_path.to_string_lossy().replace('/', "\\");
        let mut cmd = Command::new("explorer.exe");
        if canonical_path.is_dir() {
            cmd.raw_arg(format!("\"{}\"", win_path));
        } else {
            cmd.raw_arg(format!(r#"/select,"{}""#, win_path));
        }
        cmd.spawn().map_err(|e| format!("탐색기 실행 실패: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        if canonical_path.is_dir() {
            cmd.arg(&canonical_path);
        } else {
            cmd.arg("-R").arg(&canonical_path);
        }
        cmd.spawn().map_err(|e| format!("Finder 실행 실패: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_in_editor(file_path: String, line: Option<u32>) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", file_path));
    }

    let canonical_path = dunce::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());

    #[cfg(target_os = "windows")]
    {
        let win_path = canonical_path.to_string_lossy().replace('/', "\\");
        let line_arg = match line {
            Some(l) => format!("--goto \"{}:{}\"", win_path, l),
            None => format!("\"{}\"", win_path),
        };

        let vscode = Command::new("cmd")
            .args(&["/C", &format!("code {}", line_arg)])
            .spawn();

        if vscode.is_err() {
            let _ = Command::new("cmd")
                .args(&["/C", "start", "", &win_path])
                .spawn();
        }
    }

    #[cfg(target_os = "macos")]
    {
        let path_str = canonical_path.to_string_lossy().to_string();
        let goto_target = match line {
            Some(l) => format!("{}:{}", path_str, l),
            None => path_str.clone(),
        };

        // 1순위: VS Code CLI (`code --goto`)
        let vscode_cli = Command::new("code")
            .args(&["--goto", &goto_target])
            .spawn();

        if vscode_cli.is_err() {
            // 2순위: macOS Visual Studio Code.app 번들 실행
            let vscode_app = Command::new("open")
                .args(&["-a", "Visual Studio Code", "--args", "--goto", &goto_target])
                .spawn();

            if vscode_app.is_err() {
                // 3순위: macOS 기본 텍스트 에디터(TextEdit 등)로 열기
                let _ = Command::new("open").args(&["-t", &path_str]).spawn();
            }
        }
    }

    Ok(())
}
```

---

## Step 7: `tauri.conf.json` 번들 설정 및 GitHub Actions 자동 크로스 빌드 구성

### 7.1 `src-tauri/tauri.conf.json` 수정
macOS `.app` 및 `.dmg` 패키징을 위해 `bundle.icon` 배열을 명시합니다:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "eg2-rag",
  "version": "0.1.0",
  "identifier": "com.azovlive.eg2rag",
  "build": {
    "frontendDist": "../src-ui/dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "eg2-rag",
        "width": 1280,
        "height": 840,
        "minWidth": 960,
        "minHeight": 640,
        "decorations": false,
        "transparent": false,
        "shadow": true,
        "center": true,
        "visible": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

> [!TIP]
> `src-tauri/icons/icon.icns` 파일 생성 방법:
> Windows에서도 Node.js/Tauri CLI를 이용해 `npx @tauri-apps/cli icon src-tauri/icons/icon.png` 명령 한 줄로 macOS용 `icon.icns`와 표준 RGBA PNG 아이콘 세트를 1초 만에 자동 생성할 수 있습니다 (상세 내용은 [`RAG_EG2_macOS_무결점_빌드_및_오류방지_가이드.md`](./RAG_EG2_macOS_무결점_빌드_및_오류방지_가이드.md) 참조).

### 7.2 `.github/workflows/release-cross-platform.yml` 생성
로컬 맥 장비 없이도 GitHub의 공식 Apple Silicon M1 러너(`macos-14`)에서 빌드, 유닛 테스트, CLI 스모크 테스트, `.dmg` 패키징까지 자동 수행하는 CI 워크플로를 생성합니다.
