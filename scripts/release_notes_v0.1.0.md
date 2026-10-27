# 🦀 eg2-rag v0.1.0 Official Cross-Platform Release

Intel Core Ultra 7 155H NPU 가속 기반 Windows 11 로컬 클라우드 고속 시맨틱 검색 엔진 & MCP 에이전트 데스크톱 앱

---

### ✨ 주요 릴리스 기능 및 업데이트 (Highlights)
- **로컬 멀티 폴더/드라이브 색인 지원:** 복수 검색 경로 지정, 상위/하위 중복 폴더 자동 검증 및 필터링
- **메모리 보호 및 대용량 파일 가드레일:**
  - 100MB 기본 문서 용량 제한 (50MB / 100MB / 200MB / 300MB / 500MB 프리셋 선택)
  - 바이너리 실행 파일 (`.exe`, `.msi`, `.dll`, `.bin`, `.iso` 등) 자동 건너뛰기
  - ZIP 압축 파일 안전 스트리밍 인덱싱 (10MB 이하 문서/이미지만 선별, 압축폭탄 방지)
  - 확장자 사용자 지정 화이트리스트/블랙리스트 추가 및 제거 UI
- **UI 및 사용성 개선:**
  - 창 좌측 상단 공식 앱 아이콘 및 버전 배지 (`v0.1.0`)
  - 도움말(`?`) 모달: 앱 정보, 제작자 (`azovlive`), 단축키 및 가이드 원클릭 조회
  - 폴더별 색인 상태 인디케이터(완료/진행중/미색인) 및 일관된 색인 진행도 표시
- **단일 바이너리 데스크톱 GUI & MCP Stdio 서버:** Claude Desktop, Cursor, Antigravity AI 에이전트 즉시 연동 가능

---

### 📦 Windows 배포 패키지 체크섬 (SHA-256)
| 파일명 | 형식 / 설명 | SHA-256 Checksum |
| :--- | :--- | :--- |
| **eg2-rag_0.1.0_x64-setup.exe** | Windows 11 NSIS 자동 설치 관리자 | `48aa60341775062256b0b586a6016bf11feb687f4a9a04a58a5f9a5e98c1cf9c` |
| **eg2-rag_0.1.0_x64-portable.zip** | 포터블 무설치 ZIP 아카이브 (실행파일 + 안내문) | `a33ca7b3293f31feb1ca724262ca53fd355101bd648c49e5b91c45f8108d39a9` |
| **eg2-rag_0.1.0_x64_en-US.msi** | Windows MSI 인스톨러 패키지 | `d3eaec73099133ff628399281086a487633d5f00e02fbc122ccd021dbcea1f00` |

### 🍏 macOS Apple Silicon 배포 패키지 (CI 자동 생성)
- **eg2-rag_0.1.0_aarch64.dmg** (Apple M1/M2/M3/M4 ANE 가속 지원)
