use std::path::Path;
use super::config::KnowledgeBundle;

pub fn normalize_path_for_query(path: &Path) -> String {
    let s = path.to_string_lossy().to_string().replace('\\', "/");
    s.to_lowercase()
}

pub fn preset_to_extensions(preset: &str) -> Vec<String> {
    match preset.to_lowercase().as_str() {
        "python" => vec!["py".into(), "ipynb".into(), "pyi".into()],
        "cpp" => vec!["cpp".into(), "hpp".into(), "c".into(), "h".into(), "cc".into(), "cxx".into()],
        "rust" => vec!["rs".into()],
        "code_all" => vec![
            "py".into(), "ipynb".into(), "cpp".into(), "hpp".into(), "c".into(), "h".into(),
            "rs".into(), "ts".into(), "js".into(), "go".into(), "java".into(), "cs".into()
        ],
        "markdown" => vec!["md".into(), "markdown".into()],
        "pdf" => vec!["pdf".into()],
        "image" => vec![
            "png".into(), "jpg".into(), "jpeg".into(), "gif".into(), "webp".into(),
            "bmp".into(), "svg".into(), "ico".into(), "tiff".into(), "tif".into(), "avif".into()
        ],
        "video" => vec![
            "mp4".into(), "webm".into(), "mkv".into(), "avi".into(), "mov".into(),
            "wmv".into(), "flv".into(), "m4v".into()
        ],
        _ => vec![],
    }
}

pub fn build_bundle_sql_filter(bundle: &KnowledgeBundle) -> String {
    let mut parts = Vec::new();

    // 1. Path prefix filter (if paths are specified)
    if !bundle.paths.is_empty() {
        let path_clauses: Vec<String> = bundle.paths.iter().map(|p| {
            let mut norm = normalize_path_for_query(p);
            if !norm.ends_with('/') {
                norm.push('/');
            }
            format!("file_path LIKE '{norm}%'")
        }).collect();

        if !path_clauses.is_empty() {
            parts.push(format!("({})", path_clauses.join(" OR ")));
        }
    }

    // 2. Extension filter
    if !bundle.extensions.is_empty() {
        let ext_literals: Vec<String> = bundle.extensions.iter().map(|ext| {
            let clean = ext.trim().trim_start_matches('.').to_lowercase();
            format!("'{clean}'")
        }).collect();

        parts.push(format!("ext IN ({})", ext_literals.join(", ")));
    }

    if parts.is_empty() {
        "1=1".to_string()
    } else {
        parts.join(" AND ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_normalize_path() {
        let p = PathBuf::from(r"C:\Users\Developer\Project\Main.PY");
        assert_eq!(normalize_path_for_query(&p), "c:/users/developer/project/main.py");
    }

    #[test]
    fn test_build_bundle_sql_filter() {
        let bundle = KnowledgeBundle {
            id: "py-test".into(),
            name: "Python Test".into(),
            description: "".into(),
            icon: "FileCode".into(),
            paths: vec![PathBuf::from(r"C:\Projects\AI")],
            preset: "python".into(),
            extensions: vec!["py".into(), "ipynb".into()],
            enabled: true,
        };

        let filter = build_bundle_sql_filter(&bundle);
        assert!(filter.contains("file_path LIKE 'c:/projects/ai/%'"));
        assert!(filter.contains("ext IN ('py', 'ipynb')"));
    }
}
