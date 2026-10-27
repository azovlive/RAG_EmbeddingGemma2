import subprocess
import urllib.request
import json
import sys
from pathlib import Path

def get_git_token():
    p = subprocess.Popen(["git", "credential", "fill"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    out, _ = p.communicate(input="protocol=https\nhost=github.com\n\n")
    for line in out.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    return None

def main():
    token = get_git_token()
    if not token:
        print("ERROR: Git token not found.")
        sys.exit(1)

    notes_path = Path(__file__).parent / "release_notes_v0.1.0.md"
    body_text = notes_path.read_text(encoding="utf-8")

    repo_owner = "azovlive"
    repo_name = "RAG_EmbeddingGemma2"
    release_id = "424373582"

    url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/releases/{release_id}"
    payload = {
        "name": "v0.1.0 - Windows 11 & macOS Apple Silicon Official Release",
        "body": body_text
    }
    payload_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload_bytes,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "release-updater"
        },
        method="PATCH"
    )

    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print("SUCCESS: Release notes updated successfully!")
        print("Release Name:", res["name"])
        print("Release URL:", res["html_url"])

    # Verification: re-fetch and check decoding
    verify_req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "release-updater"
        }
    )
    with urllib.request.urlopen(verify_req) as resp:
        verify_data = json.loads(resp.read().decode("utf-8"))
        retrieved_body = verify_data.get("body", "")
        # Check specific Korean phrases
        assert "Intel Core Ultra 7 155H NPU 가속 기반" in retrieved_body
        assert "로컬 멀티 폴더/드라이브 색인 지원" in retrieved_body
        assert "메모리 보호 및 대용량 파일 가드레일" in retrieved_body
        assert "48aa60341775062256b0b586a6016bf11feb687f4a9a04a58a5f9a5e98c1cf9c" in retrieved_body
        print("VERIFIED: All Korean text and SHA-256 hashes verified on GitHub API!")

if __name__ == "__main__":
    main()
