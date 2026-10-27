use std::fs::File;
use std::io::Read;
use std::path::Path;
use anyhow::Result;
use zip::ZipArchive;
use super::code_chunker::{CodeChunk, CodeChunker};
use super::extractor::TextExtractor;
use super::pdf_parser::PdfParser;

#[derive(Debug, Clone)]
pub struct ZipEntryResult {
    pub internal_path: String,
    pub file_name: String,
    pub ext: String,
    pub chunks: Vec<CodeChunk>,
}

pub struct ZipParser;

impl ZipParser {
    pub fn parse_zip(
        zip_path: &Path,
        max_entry_size_mb: usize,
        allowed_extensions: &[String],
    ) -> Result<Vec<ZipEntryResult>> {
        let file = File::open(zip_path)?;
        let mut archive = ZipArchive::new(file)?;
        let mut results = Vec::new();

        let max_entry_bytes = (max_entry_size_mb as u64) * 1024 * 1024;
        let mut total_extracted_bytes: u64 = 0;
        let max_total_bytes: u64 = 100 * 1024 * 1024; // 100MB cumulative limit for safety
        let max_entries_count = 300;

        let total_files = archive.len();

        for i in 0..total_files {
            if results.len() >= max_entries_count {
                break;
            }
            if total_extracted_bytes >= max_total_bytes {
                break;
            }

            let mut zip_file = match archive.by_index(i) {
                Ok(f) => f,
                Err(_) => continue,
            };

            if zip_file.is_dir() {
                continue;
            }

            let raw_name = zip_file.name().to_string();
            // Skip hidden files or OS artifacts in zip like __MACOSX, .DS_Store
            if raw_name.contains("__MACOSX") || raw_name.ends_with(".DS_Store") || raw_name.starts_with('.') {
                continue;
            }

            let entry_path = Path::new(&raw_name);
            let ext = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            // Check if extension is in allowed_extensions
            if !allowed_extensions.iter().any(|allowed| allowed.eq_ignore_ascii_case(&ext)) {
                continue;
            }

            let uncompressed_size = zip_file.size();
            if uncompressed_size > max_entry_bytes || uncompressed_size == 0 {
                continue;
            }

            if total_extracted_bytes + uncompressed_size > max_total_bytes {
                break;
            }

            let file_name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&raw_name)
                .to_string();

            // Read entry bytes safely
            let mut entry_bytes = Vec::with_capacity(uncompressed_size as usize);
            if zip_file.read_to_end(&mut entry_bytes).is_err() {
                continue;
            }
            total_extracted_bytes += entry_bytes.len() as u64;

            let is_image = matches!(
                ext.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "ico"
            );

            let chunks = if is_image {
                let file_len = entry_bytes.len();
                let formatted_size = if file_len < 1024 {
                    format!("{} B", file_len)
                } else if file_len < 1024 * 1024 {
                    format!("{:.1} KB", file_len as f64 / 1024.0)
                } else {
                    format!("{:.1} MB", file_len as f64 / (1024.0 * 1024.0))
                };
                vec![CodeChunk {
                    start_line: 1,
                    end_line: 1,
                    symbol: format!("[ZIP 이미지] {file_name}"),
                    content: format!(
                        "[ZIP 압축 파일 내 이미지: {file_name}]\n형식: {}\n크기: {formatted_size}\n압축 파일: {}\n내부 경로: {raw_name}",
                        ext.to_uppercase(),
                        zip_path.display()
                    ),
                    lang: "image".to_string(),
                }]
            } else if ext == "pdf" {
                PdfParser::parse_pdf_bytes(&entry_bytes).unwrap_or_default()
            } else {
                let content_str = String::from_utf8_lossy(&entry_bytes);
                match ext.as_str() {
                    "py" | "ipynb" | "cpp" | "hpp" | "c" | "h" | "cc" | "rs" => {
                        CodeChunker::chunk_file(entry_path, &content_str).unwrap_or_default()
                    }
                    "md" | "markdown" | "txt" | "csv" | "log" | "rtf" | "json" | "toml" | "yaml" | "yml" | "xml" => {
                        TextExtractor::extract_chunks(&content_str, &ext).unwrap_or_default()
                    }
                    _ => {
                        CodeChunker::chunk_generic(&content_str, &ext).unwrap_or_default()
                    }
                }
            };

            if !chunks.is_empty() {
                results.push(ZipEntryResult {
                    internal_path: raw_name,
                    file_name,
                    ext,
                    chunks,
                });
            }
        }

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::{SimpleFileOptions, ZipWriter};

    #[test]
    fn test_parse_zip_selective_extraction() {
        let temp_dir = std::env::temp_dir().join(format!(
            "eg2_zip_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let zip_path = temp_dir.join("test_archive.zip");

        // Create a test zip file
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = ZipWriter::new(file);
            let options = SimpleFileOptions::default();

            // 1. A valid small markdown document (should be extracted)
            zip.start_file("docs/readme.md", options).unwrap();
            zip.write_all(b"# Hello from ZIP\nThis is a small test doc in zip.").unwrap();

            // 2. An installer / exe binary (should be SKIPPED)
            zip.start_file("bin/setup.exe", options).unwrap();
            zip.write_all(&vec![0x90u8; 1024]).unwrap();

            // 3. A python code file (should be extracted)
            zip.start_file("scripts/hello.py", options).unwrap();
            zip.write_all(b"def hello():\n    print('world')\n").unwrap();

            zip.finish().unwrap();
        }

        let allowed = vec!["md".to_string(), "py".to_string(), "txt".to_string()];
        let results = ZipParser::parse_zip(&zip_path, 10, &allowed).unwrap();

        assert_eq!(results.len(), 2);
        let names: Vec<String> = results.iter().map(|r| r.file_name.clone()).collect();
        assert!(names.contains(&"readme.md".to_string()));
        assert!(names.contains(&"hello.py".to_string()));
        assert!(!names.contains(&"setup.exe".to_string()));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
