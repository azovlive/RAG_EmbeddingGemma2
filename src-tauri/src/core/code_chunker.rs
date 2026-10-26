use std::path::Path;
use anyhow::Result;

#[derive(Debug, Clone)]
pub struct CodeChunk {
    pub symbol: String,
    pub start_line: u32,
    pub end_line: u32,
    pub content: String,
    pub lang: String,
}

pub struct CodeChunker;

impl CodeChunker {
    pub fn chunk_file(path: &Path, content: &str) -> Result<Vec<CodeChunk>> {
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        
        match ext.as_str() {
            "py" | "pyi" => Self::chunk_python(content),
            "ipynb" => Self::chunk_ipynb(content),
            "cpp" | "hpp" | "c" | "h" | "cc" | "cxx" => Self::chunk_cpp(content),
            "rs" => Self::chunk_rust(content),
            _ => Self::chunk_generic(content, &ext),
        }
    }

    fn chunk_python(content: &str) -> Result<Vec<CodeChunk>> {
        let mut parser = tree_sitter::Parser::new();
        let lang = tree_sitter_python::language();
        parser.set_language(&lang)?;

        let tree = match parser.parse(content, None) {
            Some(t) => t,
            None => return Self::chunk_generic(content, "python"),
        };

        let root = tree.root_node();
        let mut chunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        Self::collect_nodes(&root, content, &lines, "python", &["function_definition", "class_definition"], &mut chunks);

        if chunks.is_empty() {
            return Self::chunk_generic(content, "python");
        }
        Ok(chunks)
    }

    fn chunk_cpp(content: &str) -> Result<Vec<CodeChunk>> {
        let mut parser = tree_sitter::Parser::new();
        let lang = tree_sitter_cpp::language();
        parser.set_language(&lang)?;

        let tree = match parser.parse(content, None) {
            Some(t) => t,
            None => return Self::chunk_generic(content, "cpp"),
        };

        let root = tree.root_node();
        let mut chunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        Self::collect_nodes(&root, content, &lines, "cpp", &["function_definition", "class_specifier", "struct_specifier"], &mut chunks);

        if chunks.is_empty() {
            return Self::chunk_generic(content, "cpp");
        }
        Ok(chunks)
    }

    fn chunk_rust(content: &str) -> Result<Vec<CodeChunk>> {
        let mut parser = tree_sitter::Parser::new();
        let lang = tree_sitter_rust::language();
        parser.set_language(&lang)?;

        let tree = match parser.parse(content, None) {
            Some(t) => t,
            None => return Self::chunk_generic(content, "rust"),
        };

        let root = tree.root_node();
        let mut chunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        Self::collect_nodes(&root, content, &lines, "rust", &["function_item", "impl_item", "struct_item", "enum_item"], &mut chunks);

        if chunks.is_empty() {
            return Self::chunk_generic(content, "rust");
        }
        Ok(chunks)
    }

    fn chunk_ipynb(content: &str) -> Result<Vec<CodeChunk>> {
        let json: serde_json::Value = serde_json::from_str(content)?;
        let cells = json.get("cells").and_then(|c| c.as_array());

        let mut chunks = Vec::new();
        if let Some(cells) = cells {
            let mut current_line = 1u32;
            for (idx, cell) in cells.iter().enumerate() {
                let cell_type = cell.get("cell_type").and_then(|t| t.as_str()).unwrap_or("");
                if cell_type == "code" || cell_type == "markdown" {
                    let source = cell.get("source");
                    let cell_content = match source {
                        Some(serde_json::Value::Array(arr)) => {
                            arr.iter().filter_map(|s| s.as_str()).collect::<Vec<_>>().join("")
                        }
                        Some(serde_json::Value::String(s)) => s.clone(),
                        _ => String::new(),
                    };

                    let line_count = cell_content.lines().count().max(1) as u32;
                    let end_line = current_line + line_count - 1;

                    if !cell_content.trim().is_empty() {
                        chunks.push(CodeChunk {
                            symbol: format!("In[{idx}] ({cell_type})"),
                            start_line: current_line,
                            end_line,
                            content: cell_content,
                            lang: if cell_type == "code" { "python".into() } else { "markdown".into() },
                        });
                    }
                    current_line = end_line + 1;
                }
            }
        }

        if chunks.is_empty() {
            return Self::chunk_generic(content, "ipynb");
        }
        Ok(chunks)
    }

    fn collect_nodes(
        node: &tree_sitter::Node,
        source: &str,
        lines: &[&str],
        lang: &str,
        target_kinds: &[&str],
        chunks: &mut Vec<CodeChunk>,
    ) {
        let kind = node.kind();
        if target_kinds.contains(&kind) {
            let start = node.start_position();
            let end = node.end_position();
            let start_line = (start.row + 1) as u32;
            let end_line = (end.row + 1) as u32;

            let first_line = lines.get(start.row).copied().unwrap_or("").trim();
            let symbol = first_line.to_string();

            if let Ok(text) = node.utf8_text(source.as_bytes()) {
                chunks.push(CodeChunk {
                    symbol,
                    start_line,
                    end_line,
                    content: text.to_string(),
                    lang: lang.to_string(),
                });
            }
            return;
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            Self::collect_nodes(&child, source, lines, lang, target_kinds, chunks);
        }
    }

    pub fn chunk_generic(content: &str, lang: &str) -> Result<Vec<CodeChunk>> {
        let mut chunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();
        let window_size = 50;
        let step = 40;

        let mut i = 0;
        while i < lines.len() {
            let end = (i + window_size).min(lines.len());
            let chunk_lines = &lines[i..end];
            let chunk_text = chunk_lines.join("\n");
            let start_line = (i + 1) as u32;
            let end_line = end as u32;

            if !chunk_text.trim().is_empty() {
                chunks.push(CodeChunk {
                    symbol: format!("Lines {start_line}-{end_line}"),
                    start_line,
                    end_line,
                    content: chunk_text,
                    lang: lang.to_string(),
                });
            }

            if end == lines.len() {
                break;
            }
            i += step;
        }

        Ok(chunks)
    }
}
