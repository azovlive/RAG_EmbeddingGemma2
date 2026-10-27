$ErrorActionPreference = "Stop"

Write-Host "=== 1. Retrieving Git Token ===" -ForegroundColor Cyan
$credInput = "protocol=https`nhost=github.com`n`n"
$credOutput = $credInput | git credential fill
$token = $null
foreach ($line in ($credOutput -split "`n")) {
    if ($line -match "^password=(.+)$") {
        $token = $Matches[1].Trim()
        break
    }
}

if (-not $token) {
    Write-Error "Failed to retrieve GitHub credential token."
    exit 1
}
Write-Host "GitHub token retrieved successfully." -ForegroundColor Green

$repoOwner = "azovlive"
$repoName = "RAG_EmbeddingGemma2"
$tag = "v0.1.0"

# Find files
$root = (Get-Location).Path
$targetExe = Join-Path $root "target\release\eg2-rag.exe"
if (-not (Test-Path $targetExe)) {
    $targetExe = Join-Path $root "src-tauri\target\release\eg2-rag.exe"
}
if (-not (Test-Path $targetExe)) {
    $targetExe = Join-Path $root "eg2-rag.exe"
}

$nsisExe = (Get-ChildItem -Path (Join-Path $root "target\release\bundle\nsis"), (Join-Path $root "src-tauri\target\release\bundle\nsis") -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
$msiFile = (Get-ChildItem -Path (Join-Path $root "target\release\bundle\msi"), (Join-Path $root "src-tauri\target\release\bundle\msi") -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName

Write-Host "Target EXE: $targetExe"
Write-Host "NSIS EXE: $nsisExe"
Write-Host "MSI File: $msiFile"

# Copy to root
Copy-Item $targetExe -Destination (Join-Path $root "eg2-rag.exe") -Force
if ($nsisExe) {
    Copy-Item $nsisExe -Destination (Join-Path $root "eg2-rag_0.1.0_x64-setup.exe") -Force
}

# Create Portable Zip
Write-Host "=== 2. Creating Portable Zip ===" -ForegroundColor Cyan
$zipPath = Join-Path $root "eg2-rag_0.1.0_x64-portable.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $root "eg2-rag.exe"), (Join-Path $root "README.md") -DestinationPath $zipPath -Force
Write-Host "Created: $zipPath ($(Get-Item $zipPath | Select-Object -ExpandProperty Length) bytes)" -ForegroundColor Green

# Compute SHA-256
Write-Host "=== 3. Calculating SHA-256 Hashes ===" -ForegroundColor Cyan
$filesToUpload = @()
$filesToUpload += (Join-Path $root "eg2-rag_0.1.0_x64-portable.zip")
if (Test-Path (Join-Path $root "eg2-rag_0.1.0_x64-setup.exe")) {
    $filesToUpload += (Join-Path $root "eg2-rag_0.1.0_x64-setup.exe")
}
if ($msiFile -and (Test-Path $msiFile)) {
    $filesToUpload += $msiFile
}

$hashes = @{}
foreach ($f in $filesToUpload) {
    $h = (Get-FileHash -Path $f -Algorithm SHA256).Hash
    $fn = [System.IO.Path]::GetFileName($f)
    $hashes[$fn] = $h
    Write-Host "$fn : $h" -ForegroundColor Yellow
}

# GitHub API Headers
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept"        = "application/vnd.github.v3+json"
    "User-Agent"    = "eg2-rag-release-script"
}

Write-Host "=== 4. Fetching Release for tag $tag ===" -ForegroundColor Cyan
$relUri = "https://api.github.com/repos/$repoOwner/$repoName/releases/tags/$tag"
try {
    $release = Invoke-RestMethod -Uri $relUri -Headers $headers -Method Get
    Write-Host "Release found: $($release.name) (ID: $($release.id))" -ForegroundColor Green
} catch {
    Write-Host "Release $tag not found. Creating..." -ForegroundColor Yellow
    $createBody = @{
        tag_name = $tag
        name     = "v0.1.0 - Windows 11 & macOS Apple Silicon Official Release"
        draft    = $false
        prerelease = $false
        body     = "## eg2-rag v0.1.0 Official Release`n`nSemantic search engine & desktop RAG."
    } | ConvertTo-Json
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repoOwner/$repoName/releases" -Headers $headers -Method Post -Body $createBody -ContentType "application/json"
    Write-Host "Release created with ID: $($release.id)" -ForegroundColor Green
}

$releaseId = $release.id

# Check existing assets and upload missing or updated ones
Write-Host "=== 5. Checking existing assets ===" -ForegroundColor Cyan
$existingAssets = $release.assets

# Upload new assets
Write-Host "=== 6. Uploading assets ===" -ForegroundColor Cyan
foreach ($f in $filesToUpload) {
    $fn = [System.IO.Path]::GetFileName($f)
    $matched = $existingAssets | Where-Object { $_.name -eq $fn }
    if ($matched) {
        Write-Host "Asset $fn already exists (ID: $($matched.id), size: $($matched.size)). Re-uploading..." -ForegroundColor Yellow
        $delUri = "https://api.github.com/repos/$repoOwner/$repoName/releases/assets/$($matched.id)"
        Invoke-RestMethod -Uri $delUri -Headers $headers -Method Delete
        Start-Sleep -Seconds 1
    }

    $uploadUri = "https://uploads.github.com/repos/$repoOwner/$repoName/releases/$releaseId/assets?name=$fn"
    Write-Host "Uploading $fn ($( (Get-Item $f).Length ) bytes)..." -ForegroundColor Cyan
    
    $uploadHeaders = @{
        "Authorization"  = "Bearer $token"
        "Accept"         = "application/vnd.github.v3+json"
        "Content-Type"   = "application/octet-stream"
        "User-Agent"     = "eg2-rag-release-script"
    }

    $uploadedAsset = Invoke-RestMethod -Uri $uploadUri -Headers $uploadHeaders -Method Post -InFile $f -TimeoutSec 600
    Write-Host "Uploaded successfully: $($uploadedAsset.browser_download_url)" -ForegroundColor Green
}

Write-Host "=== 7. Updating Release Notes with Hashes ===" -ForegroundColor Cyan
$bodyText = @"
# 🦀 eg2-rag v0.1.0 Official Cross-Platform Release

Intel Core Ultra 7 155H NPU 가속 기반 Windows 11 로컬 클라우드 고속 시맨틱 검색 엔진 & MCP 에이전트 데스크톱 앱

---

### ✨ 주요 릴리스 기능 및 업데이트 (Highlights)
- **로컬 멀티 폴더/드라이브 색인 지원:** 복수 검색 경로 지정, 상위/하위 중복 폴더 자동 검증 및 필터링
- **메모리 보호 및 대용량 파일 가드레일:**
  - 100MB 기본 문서 용량 제한 (50MB / 100MB / 200MB / 300MB / 500MB 옵션)
  - 바이너리 실행 파일 (exe, msi, dll, bin, iso 등) 자동 건너뛰기
  - ZIP 압축 파일 안전 스트리밍 인덱싱 (10MB 이하 문서/이미지만 선별, 압축폭탄 방지)
  - 확장자 사용자 지정 화이트리스트/블랙리스트 추가 및 제거 UI
- **UI 및 사용성 개선:**
  - 창 좌측 상단 공식 앱 아이콘 및 버전 배지(v0.1.0)
  - 도움말(?) 모달: 앱 정보, 제작자(azovlive), 사용 가이드 원클릭 조회
  - 폴더별 색인 상태 인디케이터(완료/진행중/미색인) 및 일관된 색인 진행도 표시
- **단일 바이너리 데스크톱 GUI & MCP Stdio 서버:** Claude Desktop, Cursor, Antigravity AI 에이전트 즉시 연동 가능

---

### 📦 Windows 배포 패키지 체크섬 (SHA-256)
| 파일명 | 파일 설명 | SHA-256 Checksum |
| :--- | :--- | :--- |
| **eg2-rag_0.1.0_x64-setup.exe** | Windows 11 NSIS 자동 설치 관리자 | `$($hashes['eg2-rag_0.1.0_x64-setup.exe'])` |
| **eg2-rag_0.1.0_x64-portable.zip** | 포터블 무설치 ZIP 아카이브 (실행파일 + 안내문) | `$($hashes['eg2-rag_0.1.0_x64-portable.zip'])` |
| **eg2-rag_0.1.0_x64_en-US.msi** | Windows MSI 인스톨러 패키지 | `$($hashes['eg2-rag_0.1.0_x64_en-US.msi'])` |

### 🍏 macOS Apple Silicon 배포 패키지 (CI 자동 생성)
- **eg2-rag_0.1.0_aarch64.dmg** (Apple M1/M2/M3/M4 ANE 가속 지원)
"@

$updateBody = @{
    body = $bodyText
} | ConvertTo-Json

$jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($updateBody)
$updateUri = "https://api.github.com/repos/$repoOwner/$repoName/releases/$releaseId"
$updatedRelease = Invoke-RestMethod -Uri $updateUri -Headers $headers -Method Patch -Body $jsonBytes -ContentType "application/json; charset=utf-8"
Write-Host "Release notes updated successfully!" -ForegroundColor Green
Write-Host "Release URL: $($updatedRelease.html_url)" -ForegroundColor Green
