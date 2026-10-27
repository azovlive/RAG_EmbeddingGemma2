use std::path::Path;
use anyhow::Result;
use super::code_chunker::CodeChunk;

pub struct PdfParser;

impl PdfParser {
    pub fn parse_pdf(path: &Path) -> Result<Vec<CodeChunk>> {
        // Enforce Read-Only access: never modify PDF
        let bytes = std::fs::read(path)?;
        
        // Try pdf-extract safely (catch any internal parser panic on malformed PDFs)
        let extracted = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            pdf_extract::extract_text_from_mem(&bytes)
        }));

        let text = match extracted {
            Ok(Ok(t)) => t,
            _ => String::new(),
        };

        let mut chunks = Vec::new();
        let pages: Vec<&str> = text.split("\x0C").collect(); // Form-feed is standard page delimiter

        for (idx, page) in pages.iter().enumerate() {
            let page_num = (idx + 1) as u32;
            let trimmed = page.trim();
            if !trimmed.is_empty() {
                chunks.push(CodeChunk {
                    symbol: format!("Page {page_num}"),
                    start_line: page_num,
                    end_line: page_num,
                    content: trimmed.to_string(),
                    lang: "pdf".to_string(),
                });
            }
        }

        if chunks.is_empty() && !text.trim().is_empty() {
            chunks.push(CodeChunk {
                symbol: "Page 1".to_string(),
                start_line: 1,
                end_line: 1,
                content: text.trim().to_string(),
                lang: "pdf".to_string(),
            });
        }

        Ok(chunks)
    }
}
