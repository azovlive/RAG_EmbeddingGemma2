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
            if p.exists() {
                return p;
            }
        }
    }

    // 2. Check local test directory next to executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let local_test = parent.join("test").join("RAG_EG2");
            if local_test.join("config.toml").exists() {
                return local_test;
            }
        }
    }

    // 3. Check local test directory in working directory
    let local_test_cur = PathBuf::from("test").join("RAG_EG2");
    if local_test_cur.join("config.toml").exists() {
        return dunce::canonicalize(&local_test_cur).unwrap_or(local_test_cur);
    }

    PathBuf::from(r"C:\RAG_EG2")
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexingConfig {
    pub target_paths: Vec<TargetFolder>,
    pub exclude_patterns: Vec<String>,
    #[serde(default = "default_true")]
    pub skip_cloud_placeholders: bool,
}

impl Default for IndexingConfig {
    fn default() -> Self {
        let mut target_paths = Vec::new();
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            let one_drive = PathBuf::from(&user_profile).join("OneDrive");
            if one_drive.exists() {
                target_paths.push(TargetFolder {
                    name: "OneDrive".to_string(),
                    path: one_drive,
                    enabled: true,
                });
            }
            let icloud = PathBuf::from(&user_profile).join("iCloudDrive");
            if icloud.exists() {
                target_paths.push(TargetFolder {
                    name: "iCloud".to_string(),
                    path: icloud,
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
                "dist".to_string(),
                "__pycache__".to_string(),
                "$Recycle.Bin".to_string(),
                "Temp".to_string(),
            ],
            skip_cloud_placeholders: true,
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
                    name: "파이썬 소스코드".to_string(),
                    description: "Python 스크립트 및 주피터 노트북 파일 선별".to_string(),
                    icon: "FileCode".to_string(),
                    paths: vec![],
                    preset: "python".to_string(),
                    extensions: vec!["py".to_string(), "ipynb".to_string(), "pyi".to_string()],
                    enabled: true,
                },
                KnowledgeBundle {
                    id: "cpp-code".to_string(),
                    name: "C/C++ 소스코드".to_string(),
                    description: "C 및 C++ 헤더/소스 파일 선별".to_string(),
                    icon: "Cpu".to_string(),
                    paths: vec![],
                    preset: "cpp".to_string(),
                    extensions: vec!["cpp".to_string(), "hpp".to_string(), "c".to_string(), "h".to_string(), "cc".to_string()],
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
