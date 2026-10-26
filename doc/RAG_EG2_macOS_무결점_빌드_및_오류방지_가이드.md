# 🛡️ eg2-rag macOS (M1 이상) 무결점 빌드 계획서 및 오류 원천 차단 가이드

* **문서명:** `RAG_EG2_macOS_무결점_빌드_및_오류방지_가이드.md`
* **버전:** v1.0.0 (로컬 Mac 테스트 불가 환경 대응 Zero-Defect Playbook)
* **작성 일자:** 2026-10-26
* **실행 대상 모델:** Gemini 3.8 Flash High
* **연계 문서:** [`RAG_EG2_macOS_M1_사양_및_아키텍처_명세서.md`](./RAG_EG2_macOS_M1_사양_및_아키텍처_명세서.md), [`RAG_EG2_macOS_통합_구현_작업계획서.md`](./RAG_EG2_macOS_통합_구현_작업계획서.md)
* **목적:** 개발자(사용자)가 로컬 환경에서 Mac 실기기를 통해 직접 디버깅할 수 없는 제약 조건을 극복하기 위해, **컴파일 단계, 번들링 단계, 런타임 실행 단계, 보안 서명(Gatekeeper) 단계에서 발생할 수 있는 10대 치명적 오류를 사전에 100% 차단**하는 빌드 계획 및 CI 무인 자동 검증 절차를 정의합니다.

---

## 1. 로컬 Mac 테스트 불가 환경을 위한 10대 치명적 에러 차단 매트릭스

로컬에서 맥 테스트를 할 수 없을 때 가장 위험한 것은 **"빌드는 통과했는데 맥에서 더블 클릭했을 때 아무 반응 없이 죽는 런타임 크래시"**와 **"사소한 리소스 누락으로 인한 번들러 실패"**입니다. 아래 10개 항목을 코드 작성 시 100% 준수해야 합니다.

| 번호 | 단계 | 치명적 오류 유형 (Failure Mode) | 발생 원인 | 원천 차단 해결책 (Zero-Defect Rule) |
| :--- | :--- | :--- | :--- | :--- |
| **ERR-01** | 컴파일 | `E0432: unresolved import tokio::net::windows` | `daemon_ipc.rs`, `cli_main.rs`, `mcp_server.rs` 상단에 Windows 전용 Named Pipe 모듈이 조건 없이 임포트됨 | `#[cfg(target_os = "windows")]`로 격리하고, 비-Windows는 `tokio::net::{UnixListener, UnixStream}` 사용 |
| **ERR-02** | 컴파일 | `E0432: unresolved import windows_sys` | `main.rs`에서 `AttachConsole`, `CreateFileW`를 조건 없이 임포트하고 호출함 | `Cargo.toml`에서 타깃 분리 및 `main.rs`의 Win32 블록에 `#[cfg(target_os = "windows")]` 명시 |
| **ERR-03** | 컴파일 | `E0599: no method named raw_arg found for Command` | `CommandExt::raw_arg`는 Windows 전용 트레이트인데 macOS 블록에서 호출할 위험 | `.raw_arg()`는 오직 `#[cfg(target_os = "windows")]` 내부에서만 사용하고 macOS는 표준 `.arg()` 사용 |
| **ERR-04** | 컴파일 | `unused variable / dead_code` 또는 스코프 누락 | `#[cfg(target_os = "macos")]` 내부에서 사용하는 변수가 조건부 블록 밖에서 선언되지 않거나 반대로 Windows에서만 쓰임 | 공통 변수(`canonical_path`)만 상단에 두고, `win_path` 등은 각 OS의 `#[cfg]` 블록 내부에서 지역 선언 |
| **ERR-05** | 번들링 | `failed to bundle project: icons/icon.icns not found` | Tauri macOS 번들러(`.app`, `.dmg`)는 `icon.icns`와 32-bit RGBA PNG가 없으면 즉시 빌드 중단 | Windows에서 `npx @tauri-apps/cli icon`을 실행하여 `icon.icns`를 사전 생성 후 Git에 포함 |
| **ERR-06** | 런타임 | **`Read-only file system (os error 30)` 즉시 크래시** | macOS에서 `.app` 더블 클릭 시 `current_dir()`는 `/` (읽기 전용 루트 볼륨). 상대 경로나 `C:\...`에 DB/설정 생성 시도 시 패닉 | `config.rs`에서 macOS 기본 경로를 반드시 `$HOME/Library/Application Support/com.eg2rag.app`로 지정 |
| **ERR-07** | 런타임 | **`Address already in use (os error 48)` 데몬 먹통** | Unix Domain Socket(`/tmp/eg2-rag-daemon.sock`)은 앱 강제 종료 시 파일이 남아 재실행 시 `bind()` 실패 | `UnixListener::bind(PIPE_NAME)` 직전에 무조건 `let _ = std::fs::remove_file(PIPE_NAME);` 실행 |
| **ERR-08** | 런타임 | **트레이 아이콘 패닉 (`Invalid Icon RGBA buffer`)** | `tray_service.rs`에서 폴백 아이콘 크기가 너무 작거나(`1x1`) 알파 채널이 맞지 않으면 macOS `NSStatusBar` 초기화 실패 가능 | `tray_service.rs`의 폴백 아이콘을 `32x32` RGBA (`vec![0u8; 32 * 32 * 4]`)로 안전하게 생성 |
| **ERR-09** | 런타임 | **iCloud 미다운로드 파일 오픈 시 인덱서 무한 멈춤** | macOS `Documents` 폴더 내 iCloud 자리표시자 파일을 읽으려 하면 네트워크 다운로드 완료까지 스레드 블로킹 | `cloud_filter.rs`에서 `.파일명.icloud` 패턴 및 `meta.st_flags() & 0x40000000` (`SF_DATALESS`) 즉시 스킵 |
| **ERR-10** | 실행 보안 | **"eg2-rag.app이 손상되었기 때문에 열 수 없습니다"** | Apple Silicon(M1+) macOS 커널은 서명되지 않은 `arm64` 바이너리 실행을 `SIGKILL`로 즉시 차단함 | 빌드 직후 `codesign --force --deep --sign - eg2-rag.app` (Ad-hoc 서명) 자동 적용 |

---

## 2. Windows 개발 환경에서 수행할 사전 준비 절차 (Pre-Build Checklist)

`Gemini 3.8 Flash High` 모델이 코드를 수정할 때, **Windows 로컬 환경에서 즉시 실행하여 macOS 리소스 오류를 100% 예방할 수 있는 사전 작업**입니다.

### 2.1 표준 RGBA 아이콘 및 `icon.icns` 자동 생성 (ERR-05 완벽 차단)

현재 `src-tauri/icons/` 폴더에는 `icon.icns` 파일이 없으며, 기본 PNG 파일(937 bytes)이 최소 더미로 되어 있습니다. Windows에서 아래 명령을 실행하면 Tauri 공식 아이콘 생성기가 macOS용 `icon.icns`와 모든 해상도의 32-bit RGBA PNG를 완벽히 생성합니다.

```powershell
# 1. 유효한 512x512 32-bit ARGB 마스터 아이콘(master-icon.png)을 PowerShell System.Drawing으로 생성
powershell -Command "
Add-Type -AssemblyName System.Drawing;
\$bmp = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb);
\$g = [System.Drawing.Graphics]::FromImage(\$bmp);
\$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias;
\$g.Clear([System.Drawing.Color]::FromArgb(255, 15, 23, 42));
\$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 56, 189, 248));
\$g.FillEllipse(\$brush, 64, 64, 384, 384);
\$bmp.Save('src-tauri/icons/master-icon.png', [System.Drawing.Imaging.ImageFormat]::Png);
\$g.Dispose();
\$bmp.Dispose();
"

# 2. Tauri CLI를 통해 macOS용 icon.icns 및 Windows용 icon.ico 일괄 생성
npx --prefix src-ui @tauri-apps/cli icon src-tauri/icons/master-icon.png --output src-tauri/icons
```

* **검증 조건**: 실행 후 `src-tauri/icons/icon.icns` 파일이 존재하는지 반드시 확인하십시오.

---

### 2.2 `src-tauri/src/core/tray_service.rs` macOS 메뉴바 안전성 보강 (ERR-08 차단)

`src-tauri/src/core/tray_service.rs` 15~18번 줄의 폴백 아이콘을 `1x1`에서 `32x32` RGBA로 보강합니다:

```rust
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
```

---

### 2.3 Windows 환경에서 macOS 코드 문법 교차 검증 기법

Windows에서 `cargo check`를 돌리면 기본적으로 `#[cfg(target_os = "windows")]` 블록만 컴파일되고 `#[cfg(target_os = "macos")]` 및 `#[cfg(not(target_os = "windows"))]` 블록은 건너뛰어집니다.
따라서 에이전트는 코드 수정을 마친 후 반드시 다음 **3단계 정적/동적 검증**을 수행해야 합니다:

1. **프론트엔드 프로덕션 빌드 검증**:
   ```powershell
   npm --prefix src-ui run build
   ```
   * TypeScript 컴파일 에러(`tsc`) 및 Vite 번들링 에러가 0건이어야 합니다.
2. **Windows 타깃 빌드 및 유닛 테스트 검증**:
   ```powershell
   cargo test --manifest-path src-tauri/Cargo.toml
   cargo build --release --manifest-path src-tauri/Cargo.toml
   ```
   * 기존 Windows 기능이 단 하나도 손상되지 않았음을 검증합니다.
3. **`#[cfg]` 블록 심볼 무결성 대조 체크리스트**:
   * `src-tauri/src/main.rs`: `#[cfg(target_os = "windows")]` 밖에 `windows_sys` 심볼이 단 하나도 남아있지 않은가?
   * `src-tauri/src/core/daemon_ipc.rs`: `#[cfg(not(target_os = "windows"))]` 블록 안의 `handle_client_stream(stream, db, embedder, config)` 인자 타입이 함수 시그니처와 정확히 일치하는가?
   * `src-tauri/src/cli/cli_main.rs` & `mcp_server.rs`: 상단에 `use tokio::net::windows::named_pipe::ClientOptions;`가 완전히 제거되고 `#[cfg(target_os = "windows")]` 블록 안으로 이동했는가?
   * `src-tauri/src/commands/system_cmd.rs`: `#[cfg(target_os = "macos")]` 블록 안에서 `Command`, `canonical_path` 변수가 정상 참조되는가?

---

## 3. GitHub Actions 기반 무인 Mac 빌드 & 자동 실증 테스트 계획서

사용자가 직접 맥에서 실행해 볼 수 없으므로, **GitHub Actions의 `macos-14` (실제 Apple M1 ARM64 하드웨어 서버) 러너가 빌드를 마친 직후 사용자를 대신하여 자동으로 앱을 실행하고 검증(Self-Test)**하도록 워크플로를 구성합니다.

### 3.1 `.github/workflows/release-cross-platform.yml` 전체 명세

프로젝트 루트의 `.github/workflows/release-cross-platform.yml` 파일로 아래 내용을 그대로 생성하십시오:

```yaml
name: Cross-Platform Release (Windows x64 & macOS Apple Silicon M1+)

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]
  workflow_dispatch:

jobs:
  # =========================================================================
  # Job 1: macOS Apple Silicon (M1/M2/M3/M4 - aarch64-apple-darwin) 빌드 및 자동 검증
  # =========================================================================
  build-macos-arm64:
    runs-on: macos-14 # GitHub 공식 Apple M1 (arm64) 러너
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Rust Stable (aarch64-apple-darwin)
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin

      - name: Rust Cargo Cache
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Build Frontend UI (React + Vite)
        run: |
          npm --prefix src-ui install
          npm --prefix src-ui run build

      - name: Generate macOS .icns Icon if Missing
        run: |
          if [ ! -f "src-tauri/icons/icon.icns" ]; then
            npx --prefix src-ui @tauri-apps/cli icon src-tauri/icons/icon.png --output src-tauri/icons || true
          fi

      - name: Step 1 - Run Rust Unit Tests on Apple Silicon M1 Hardware
        run: |
          cargo test --manifest-path src-tauri/Cargo.toml --release -- --nocapture

      - name: Step 2 - Build Tauri macOS Application (.app & .dmg)
        run: |
          npx --prefix src-ui @tauri-apps/cli build --target aarch64-apple-darwin

      - name: Step 3 - Automated Headless & CLI Smoke Test on M1 Runner
        run: |
          BIN_PATH="src-tauri/target/aarch64-apple-darwin/release/eg2-rag"
          if [ ! -f "$BIN_PATH" ]; then
            BIN_PATH="target/aarch64-apple-darwin/release/eg2-rag"
          fi
          echo "Testing binary at: $BIN_PATH"
          chmod +x "$BIN_PATH"

          # 1) CLI Status 테스트 (독립 실행 모드 및 ~/Library/Application Support 경로 생성 검증)
          "$BIN_PATH" status

          # 2) 샘플 문서 색인 및 Apple Silicon Accelerate(vDSP) 가속 연산 검증
          mkdir -p /tmp/eg2_mac_test_docs
          echo "# Apple Silicon M1 Test Document\nSemantic search on macOS M1 ANE/AMX works!" > /tmp/eg2_mac_test_docs/readme.md
          "$BIN_PATH" index
          "$BIN_PATH" query "Apple Silicon" --json

      - name: Step 4 - Ad-hoc Code Signing (Gatekeeper 차단 방지)
        run: |
          APP_BUNDLE=$(find src-tauri/target target -name "eg2-rag.app" -type d 2>/dev/null | head -n 1)
          if [ -n "$APP_BUNDLE" ]; then
            echo "Signing App Bundle: $APP_BUNDLE"
            codesign --force --deep --sign - "$APP_BUNDLE"
            codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
          fi

      - name: Upload macOS Apple Silicon Artifacts (.dmg & .app)
        uses: actions/upload-artifact@v4
        with:
          name: eg2-rag-macos-apple-silicon-arm64
          path: |
            src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
            src-tauri/target/aarch64-apple-darwin/release/bundle/macos/*.app
            target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
            target/aarch64-apple-darwin/release/bundle/macos/*.app
          if-no-files-found: ignore

  # =========================================================================
  # Job 2: Windows 11 (x86_64-pc-windows-msvc) 빌드 및 검증
  # =========================================================================
  build-windows-x64:
    runs-on: windows-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Rust Stable (x86_64-pc-windows-msvc)
        uses: dtolnay/rust-toolchain@stable

      - name: Rust Cargo Cache
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Build Frontend UI
        run: |
          npm --prefix src-ui install
          npm --prefix src-ui run build

      - name: Build Windows Release Binary
        run: |
          cargo build --release --manifest-path src-tauri/Cargo.toml

      - name: Upload Windows Executable Artifact
        uses: actions/upload-artifact@v4
        with:
          name: eg2-rag-windows-x64
          path: |
            src-tauri/target/release/eg2-rag.exe
            target/release/eg2-rag.exe
          if-no-files-found: ignore
```

---

## 4. macOS 사용자 배포 시 안내 사항 (Gatekeeper 우회 명령)

Apple 유료 개발자 계정(연 $99 Apple Developer Program Notarization) 없이 빌드된 `.dmg`/`.app` 파일을 Mac에서 처음 실행할 때, macOS 보안 정책(Gatekeeper)이 경고를 띄울 수 있습니다.
Step 4에서 Ad-hoc 서명(`codesign --force --deep --sign -`)을 완료했으므로, Mac에서는 `/Applications` 폴더로 이동 후 터미널에서 아래 명령 한 줄만 실행하면 즉시 정상 구동됩니다:

```bash
xattr -cr /Applications/eg2-rag.app
```

---

## 5. Gemini 3.8 Flash High 실행용 프롬프트 (복사하여 바로 사용)

다음 턴에서 `Gemini 3.8 Flash High` 모델로 전환한 뒤, 아래 프롬프트를 그대로 입력하시면 모델이 위 3개 문서를 읽고 에러 없이 단번에 구현과 빌드를 수행합니다:

```text
doc 폴더에 작성된 다음 3개의 문서를 먼저 모두 정독하고, 문서에 명시된 코드와 절차에 따라 맥용(Apple Silicon M1 이상) 단일 프로젝트 통합 구현 및 빌드를 수행해라:
1. doc/RAG_EG2_macOS_M1_사양_및_아키텍처_명세서.md
2. doc/RAG_EG2_macOS_통합_구현_작업계획서.md
3. doc/RAG_EG2_macOS_무결점_빌드_및_오류방지_가이드.md

작업 지침:
1. RAG_EG2_macOS_통합_구현_작업계획서.md의 Step 1부터 Step 7까지 누락이나 축약 없이 정확하게 코드에 반영해라.
2. RAG_EG2_macOS_무결점_빌드_및_오류방지_가이드.md의 2.1절 아이콘 생성(icon.icns 생성) 및 2.2절 트레이 폴백 보강을 수행해라.
3. 수정 후 프론트엔드 빌드(npm --prefix src-ui run build), Rust 유닛 테스트(cargo test --manifest-path src-tauri/Cargo.toml), 릴리스 빌드(cargo build --release --manifest-path src-tauri/Cargo.toml)를 실행하여 에러와 경고가 0건인지 검증하고 eg2-rag.exe를 갱신한 뒤 git push 해라.
```
