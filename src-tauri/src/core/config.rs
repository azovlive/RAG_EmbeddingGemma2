use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    pub base_dir: PathBuf,
    pub lancedb_dir: PathBuf,
    pub models_dir: PathBuf,
}

impl Default for StorageConfig {
    fn default() -> Self {
        let base_dir = get_default_base_dir();
        Self {
            lancedb_dir: base_dir.join("lancedb"),
            models_dir: base_dir.join("models"),
            base_dir,
        }
    }
}

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

    // 2. Check CARGO_MANIFEST_DIR (active during cargo test / cargo run)
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let p = PathBuf::from(manifest_dir);
        if let Some(parent) = p.parent() {
            let manifest_test = parent.join("test").join("RAG_EG2");
            if manifest_test.join("config.toml").exists() {
                return dunce::canonicalize(&manifest_test).unwrap_or(manifest_test);
            }
        }
    }

    // 3. Check local test directory in working directory or parent
    for base in &[PathBuf::from("."), PathBuf::from("..")] {
        let local_test = base.join("test").join("RAG_EG2");
        if local_test.join("config.toml").exists() {
            return dunce::canonicalize(&local_test).unwrap_or(local_test);
        }
    }

    // 4. Check executable parent
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            for base in &[parent.to_path_buf(), parent.parent().unwrap_or(parent).to_path_buf()] {
                let local_test = base.join("test").join("RAG_EG2");
                if local_test.join("config.toml").exists() {
                    return dunce::canonicalize(&local_test).unwrap_or(local_test);
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let app_dir = PathBuf::from(local_app_data).join("eg2-rag");
            let _ = std::fs::create_dir_all(&app_dir);
            return app_dir;
        }
        PathBuf::from(r"C:\RAG_EG2")
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let mac_app_dir = PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("com.eg2rag.desktop");
            let _ = std::fs::create_dir_all(&mac_app_dir);
            return mac_app_dir;
        }
        let fallback = PathBuf::from("/tmp/eg2-rag-data");
        let _ = std::fs::create_dir_all(&fallback);
        fallback
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetFolder {
    pub name: String,
    pub path: PathBuf,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

fn default_max_file_size_mb() -> usize {
    100
}

fn default_max_zip_entry_size_mb() -> usize {
    10
}

fn default_binary_extensions() -> Vec<String> {
    vec![
        "exe".to_string(), "msi".to_string(), "dll".to_string(), "sys".to_string(),
        "bin".to_string(), "iso".to_string(), "dmg".to_string(), "pkg".to_string(),
        "cab".to_string(), "vmdk".to_string(), "vhdx".to_string(), "so".to_string(),
        "dylib".to_string(), "apk".to_string(), "appx".to_string(), "msix".to_string(),
    ]
}

fn default_zip_allowed_extensions() -> Vec<String> {
    vec![
        "md".to_string(), "txt".to_string(), "pdf".to_string(), "doc".to_string(),
        "docx".to_string(), "ppt".to_string(), "pptx".to_string(), "xls".to_string(),
        "xlsx".to_string(), "hwp".to_string(), "hwpx".to_string(), "py".to_string(),
        "ipynb".to_string(), "cpp".to_string(), "c".to_string(), "h".to_string(),
        "rs".to_string(), "json".to_string(), "toml".to_string(), "yaml".to_string(),
        "csv".to_string(), "log".to_string(), "png".to_string(), "jpg".to_string(),
        "jpeg".to_string(), "gif".to_string(), "webp".to_string(), "bmp".to_string(),
        "svg".to_string(),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexingConfig {
    pub target_paths: Vec<TargetFolder>,
    pub exclude_patterns: Vec<String>,
    #[serde(default = "default_true")]
    pub skip_cloud_placeholders: bool,
    #[serde(default = "default_max_file_size_mb")]
    pub max_file_size_mb: usize,
    #[serde(default = "default_true")]
    pub skip_binary_executables: bool,
    #[serde(default = "default_binary_extensions")]
    pub binary_extensions: Vec<String>,
    #[serde(default = "default_true")]
    pub enable_zip_indexing: bool,
    #[serde(default = "default_max_zip_entry_size_mb")]
    pub max_zip_entry_size_mb: usize,
    #[serde(default = "default_zip_allowed_extensions")]
    pub zip_allowed_extensions: Vec<String>,
}

impl Default for IndexingConfig {
    fn default() -> Self {
        let mut target_paths = Vec::new();

        // 1. Check CARGO_MANIFEST_DIR (active during cargo test / cargo run)
        let mut test_target = None;
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let p = PathBuf::from(manifest_dir);
            if let Some(parent) = p.parent() {
                let candidate = parent.join("test").join("target");
                if candidate.exists() {
                    test_target = Some(dunce::canonicalize(&candidate).unwrap_or(candidate));
                }
            }
        }

        // 2. Check relative candidate paths
        if test_target.is_none() {
            for base in &[PathBuf::from("."), PathBuf::from("..")] {
                let candidate = base.join("test").join("target");
                if candidate.exists() {
                    test_target = Some(dunce::canonicalize(&candidate).unwrap_or(candidate));
                    break;
                }
            }
        }

        if let Some(target) = test_target {
            target_paths.push(TargetFolder {
                name: "TestTarget".to_string(),
                path: target,
                enabled: true,
            });
        } else if let Ok(user_profile) = std::env::var("USERPROFILE") {
            let docs = PathBuf::from(&user_profile).join("Documents");
            if docs.exists() {
                target_paths.push(TargetFolder {
                    name: "Documents".to_string(),
                    path: docs,
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
                ".obsidian".to_string(),
                ".trash".to_string(),
            ],
            skip_cloud_placeholders: true,
            max_file_size_mb: default_max_file_size_mb(),
            skip_binary_executables: true,
            binary_extensions: default_binary_extensions(),
            enable_zip_indexing: true,
            max_zip_entry_size_mb: default_max_zip_entry_size_mb(),
            zip_allowed_extensions: default_zip_allowed_extensions(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeBundle {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_bundle_icon")]
    pub icon: String,
    pub paths: Vec<PathBuf>,
    #[serde(default = "default_preset_custom")]
    pub preset: String,
    pub extensions: Vec<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_bundle_icon() -> String {
    "BookOpen".to_string()
}

fn default_preset_custom() -> String {
    "custom".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceConfig {
    #[serde(default = "default_device")]
    pub device: String,
    #[serde(default = "default_vector_dim")]
    pub vector_dim: usize,
}

fn default_device() -> String {
    "npu".to_string()
}

fn default_vector_dim() -> usize {
    256
}

impl Default for InferenceConfig {
    fn default() -> Self {
        Self {
            device: default_device(),
            vector_dim: default_vector_dim(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceGovernorConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_max_cpu")]
    pub max_cpu_percent: f32,
    #[serde(default = "default_max_ram")]
    pub max_ram_percent: f32,
}

fn default_max_cpu() -> f32 {
    65.0
}

fn default_max_ram() -> f32 {
    80.0
}

impl Default for ResourceGovernorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_cpu_percent: default_max_cpu(),
            max_ram_percent: default_max_ram(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub storage: StorageConfig,
    pub indexing: IndexingConfig,
    #[serde(default)]
    pub bundles: Vec<KnowledgeBundle>,
    pub inference: InferenceConfig,
    pub resource_governor: ResourceGovernorConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            storage: StorageConfig::default(),
            indexing: IndexingConfig::default(),
            bundles: vec![
                KnowledgeBundle {
                    id: "python-code".to_string(),
                    name: "파이썬 묶음".to_string(),
                    description: "Python 스크립트 및 주피터 노트북 파일 선별".to_string(),
                    icon: "FileCode".to_string(),
                    paths: vec![],
                    preset: "python".to_string(),
                    extensions: vec!["py".to_string(), "ipynb".to_string(), "pyi".to_string()],
                    enabled: true,
                },
                KnowledgeBundle {
                    id: "markdown-notes".to_string(),
                    name: "마크다운 문서/메모".to_string(),
                    description: "옵시디언 및 마크다운 지식 베이스".to_string(),
                    icon: "BookOpen".to_string(),
                    paths: vec![],
                    preset: "markdown".to_string(),
                    extensions: vec!["md".to_string(), "markdown".to_string()],
                    enabled: true,
                },
                KnowledgeBundle {
                    id: "media-image".to_string(),
                    name: "이미지 미디어".to_string(),
                    description: "PNG, JPG, SVG, WebP 등 이미지 미디어 선별".to_string(),
                    icon: "Image".to_string(),
                    paths: vec![],
                    preset: "image".to_string(),
                    extensions: vec![
                        "png".to_string(), "jpg".to_string(), "jpeg".to_string(), "gif".to_string(),
                        "webp".to_string(), "bmp".to_string(), "svg".to_string(), "ico".to_string()
                    ],
                    enabled: true,
                },
                KnowledgeBundle {
                    id: "media-video".to_string(),
                    name: "동영상 미디어".to_string(),
                    description: "MP4, WebM, MKV 등 영상 미디어 선별".to_string(),
                    icon: "Video".to_string(),
                    paths: vec![],
                    preset: "video".to_string(),
                    extensions: vec![
                        "mp4".to_string(), "webm".to_string(), "mkv".to_string(), "avi".to_string(),
                        "mov".to_string(), "wmv".to_string(), "flv".to_string()
                    ],
                    enabled: true,
                },
            ],
            inference: InferenceConfig::default(),
            resource_governor: ResourceGovernorConfig::default(),
        }
    }
}

impl AppConfig {
    pub fn load_from_dir(base_dir: &Path) -> Result<Self> {
        let conf_path = base_dir.join("config.toml");
        if conf_path.exists() {
            let content = std::fs::read_to_string(&conf_path)?;
            let config: AppConfig = toml::from_str(&content)?;
            Ok(config)
        } else {
            let config = AppConfig::default();
            std::fs::create_dir_all(base_dir)?;
            let content = toml::to_string_pretty(&config)?;
            std::fs::write(&conf_path, content)?;
            Ok(config)
        }
    }

    pub fn save(&self) -> Result<()> {
        let conf_path = self.storage.base_dir.join("config.toml");
        std::fs::create_dir_all(&self.storage.base_dir)?;
        let content = toml::to_string_pretty(self)?;
        std::fs::write(conf_path, content)?;
        Ok(())
    }

    pub fn ensure_bundle_paths(&mut self, bundle: &KnowledgeBundle) -> bool {
        let mut added = false;
        for path in &bundle.paths {
            let already_covered = self.indexing.target_paths.iter().any(|target| {
                path.starts_with(&target.path)
            });
            if !already_covered {
                self.indexing.target_paths.push(TargetFolder {
                    name: path.file_name().and_then(|n| n.to_str()).unwrap_or("Folder").to_string(),
                    path: path.clone(),
                    enabled: true,
                });
                added = true;
            }
        }
        added
    }
}
