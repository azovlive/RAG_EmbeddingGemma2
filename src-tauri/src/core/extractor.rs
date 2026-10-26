use anyhow::Result;
use super::code_chunker::CodeChunk;

pub struct TextExtractor;

impl TextExtractor {
    pub fn extract_chunks(content: &str, ext: &str) -> Result<Vec<CodeChunk>> {
        let lines: Vec<&str> = content.lines().collect();
        let mut chunks = Vec::new();

        let mut current_chunk = Vec::new();
        let mut chunk_start_line = 1u32;
        let mut current_heading = String::new();

        for (idx, line) in lines.iter().enumerate() {
            let line_num = (idx + 1) as u32;
            let trimmed = line.trim();

            if trimmed.starts_with('#') {
                if !current_chunk.is_empty() {
                    let end_line = line_num - 1;
                    chunks.push(CodeChunk {
                        symbol: if current_heading.is_empty() { format!("Lines {chunk_start_line}-{end_line}") } else { current_heading.clone() },
                        start_line: chunk_start_line,
                        end_line,
                        content: current_chunk.join("\n"),
                        lang: ext.to_string(),
                    });
                    current_chunk.clear();
                }
                current_heading = trimmed.to_string();
                chunk_start_line = line_num;
            }

            current_chunk.push(*line);

            // Cap chunk size at ~1200 characters or ~40 lines
            if current_chunk.len() >= 40 {
                let end_line = line_num;
                chunks.push(CodeChunk {
                    symbol: if current_heading.is_empty() { format!("Lines {chunk_start_line}-{end_line}") } else { current_heading.clone() },
                    start_line: chunk_start_line,
                    end_line,
                    content: current_chunk.join("\n"),
                    lang: ext.to_string(),
                });
                current_chunk.clear();
                chunk_start_line = line_num + 1;
            }
        }

        if !current_chunk.is_empty() {
            let end_line = lines.len() as u32;
            chunks.push(CodeChunk {
                symbol: if current_heading.is_empty() { format!("Lines {chunk_start_line}-{end_line}") } else { current_heading.clone() },
                start_line: chunk_start_line,
                end_line,
                content: current_chunk.join("\n"),
                lang: ext.to_string(),
            });
        }

        Ok(chunks)
    }
}
