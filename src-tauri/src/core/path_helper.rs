use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use sysinfo::Disks;
use crate::core::config::TargetFolder;

/// Path relation between two directory or drive paths
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PathRelation {
    /// Exactly the same path (or canonical equivalent)
    Identical,
    /// `candidate` is a subfolder of `existing` (existing is parent/ancestor)
    IsSubfolder,
    /// `candidate` is an ancestor/parent of `existing` (candidate contains existing)
    IsParent,
    /// Independent paths with no parent-child relationship
    Independent,
}

/// Normalized representation of a directory/drive path for consistent comparison
pub fn normalize_dir_string(path: &Path) -> String {
    let s = path.to_string_lossy().trim().replace('\\', "/");
    #[cfg(target_os = "windows")]
    let s = s.to_lowercase();

    // Preserve root slash for root drives: "c:/" or "/"
    // For non-root, trim trailing slash: "c:/projects/" -> "c:/projects"
    let is_windows_drive_root = s.len() == 3 && s.chars().nth(1) == Some(':') && s.ends_with('/');
    let is_unix_root = s == "/";

    if is_windows_drive_root || is_unix_root {
        s
    } else if s.len() == 2 && s.chars().nth(1) == Some(':') {
        // e.g. "c:" -> "c:/"
        format!("{}/", s)
    } else {
        s.trim_end_matches('/').to_string()
    }
}

/// Determine hierarchical relationship between `candidate` and `existing`
pub fn check_path_relation(candidate: &Path, existing: &Path) -> PathRelation {
    let cand_norm = normalize_dir_string(candidate);
    let exist_norm = normalize_dir_string(existing);

    if cand_norm == exist_norm {
        return PathRelation::Identical;
    }

    // Check if candidate is subfolder of existing
    let is_sub = if exist_norm.ends_with('/') {
        cand_norm.starts_with(&exist_norm)
    } else {
        cand_norm.starts_with(&format!("{}/", exist_norm))
    };

    if is_sub {
        return PathRelation::IsSubfolder;
    }

    // Check if candidate is parent of existing
    let is_parent = if cand_norm.ends_with('/') {
        exist_norm.starts_with(&cand_norm)
    } else {
        exist_norm.starts_with(&format!("{}/", cand_norm))
    };

    if is_parent {
        return PathRelation::IsParent;
    }

    PathRelation::Independent
}

/// Prune redundant subdirectories from a directory list.
/// If both `C:\Projects` and `C:\Projects\Sub` are present, `C:\Projects\Sub` is removed.
pub fn prune_subdirectories(dirs: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut sorted = dirs;
    // Shorter paths (ancestors) first
    sorted.sort_by_key(|p| normalize_dir_string(p).len());

    let mut result: Vec<PathBuf> = Vec::new();
    for dir in sorted {
        let is_redundant = result.iter().any(|parent| {
            matches!(check_path_relation(&dir, parent), PathRelation::Identical | PathRelation::IsSubfolder)
        });
        if !is_redundant {
            result.push(dir);
        }
    }
    result
}

/// Drive / Disk information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveInfo {
    pub mount_point: String,
    pub name: String,
    pub total_space_gb: f64,
    pub available_space_gb: f64,
    pub file_system: String,
    pub is_already_targeted: bool,
    pub covering_target_path: Option<String>,
}

/// Query available system storage drives / mount points
pub fn get_available_drives(current_targets: &[TargetFolder]) -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut drives = Vec::new();

    for disk in &disks {
        let mount_str = disk.mount_point().to_string_lossy().to_string();
        let mount_path = PathBuf::from(&mount_str);

        let mut is_targeted = false;
        let mut covering_target = None;

        for target in current_targets {
            match check_path_relation(&mount_path, &target.path) {
                PathRelation::Identical => {
                    is_targeted = true;
                    covering_target = Some(target.path.to_string_lossy().to_string());
                    break;
                }
                PathRelation::IsSubfolder => {
                    covering_target = Some(target.path.to_string_lossy().to_string());
                    break;
                }
                _ => {}
            }
        }

        let total_gb = (disk.total_space() as f64) / (1024.0 * 1024.0 * 1024.0);
        let avail_gb = (disk.available_space() as f64) / (1024.0 * 1024.0 * 1024.0);
        let name_str = disk.name().to_string_lossy().to_string();
        let fs_str = disk.file_system().to_string_lossy().to_string();

        drives.push(DriveInfo {
            mount_point: mount_str,
            name: if name_str.is_empty() { "로컬 드라이브".to_string() } else { name_str },
            total_space_gb: (total_gb * 100.0).round() / 100.0,
            available_space_gb: (avail_gb * 100.0).round() / 100.0,
            file_system: fs_str,
            is_already_targeted: is_targeted,
            covering_target_path: covering_target,
        });
    }

    drives
}

/// Input item for adding target folders
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderAddInput {
    pub name: Option<String>,
    pub path: String,
}

/// Validation message severity / type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageSeverity {
    Info,
    Warning,
    Success,
    Error,
}

/// Detailed item-level process message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathProcessMessage {
    pub path: String,
    pub title: String,
    pub message: String,
    pub severity: MessageSeverity,
    pub related_paths: Vec<String>,
}

/// Result of validating and adding target folders
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetProcessReport {
    pub success: bool,
    pub added_paths: Vec<String>,
    pub removed_subfolders: Vec<String>,
    pub skipped_subfolders: Vec<String>,
    pub skipped_duplicates: Vec<String>,
    pub messages: Vec<PathProcessMessage>,
    pub current_targets: Vec<TargetFolder>,
}

/// Validate and apply new target folders according to hierarchical rules:
/// 1. If candidate is identical to existing: Skip with duplicate notice.
/// 2. If candidate is subfolder of existing: Skip with warning that parent covers it.
/// 3. If candidate is parent of existing: Remove existing children and add parent (absorb/consolidate).
/// 4. If candidates overlap with each other: Parent subsumes child.
/// 5. If candidate is independent: Add to targets.
pub fn validate_and_apply_targets(
    current_targets: &mut Vec<TargetFolder>,
    inputs: Vec<FolderAddInput>,
) -> TargetProcessReport {
    let mut added_paths = Vec::new();
    let mut removed_subfolders = Vec::new();
    let mut skipped_subfolders = Vec::new();
    let mut skipped_duplicates = Vec::new();
    let mut messages = Vec::new();

    // 1. Filter out empty or non-existent paths
    let mut valid_candidates: Vec<(String, PathBuf)> = Vec::new();
    for input in inputs {
        let trimmed = input.path.trim();
        if trimmed.is_empty() {
            continue;
        }
        let p = PathBuf::from(trimmed);
        if !p.exists() {
            messages.push(PathProcessMessage {
                path: trimmed.to_string(),
                title: "존재하지 않는 경로".to_string(),
                message: format!("'{}' 경로가 파일 시스템에 존재하지 않아 건너뜁니다.", trimmed),
                severity: MessageSeverity::Error,
                related_paths: vec![],
            });
            continue;
        }

        // Canonicalize or dunce resolve
        let resolved = dunce::canonicalize(&p).unwrap_or(p);
        let name = input.name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| {
            resolved
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_else(|| resolved.to_str().unwrap_or("Folder"))
                .to_string()
        });
        valid_candidates.push((name, resolved));
    }

    // 2. Intra-batch deduplication: if candidates in the same request contain parent & child
    // Sort shorter paths (ancestors) first
    valid_candidates.sort_by_key(|(_, p)| normalize_dir_string(p).len());
    let mut deduped_candidates: Vec<(String, PathBuf)> = Vec::new();

    for (name, cand_path) in valid_candidates {
        let mut absorbed_by = None;
        for (_, existing_cand) in &deduped_candidates {
            if check_path_relation(&cand_path, existing_cand) == PathRelation::IsSubfolder {
                absorbed_by = Some(existing_cand.to_string_lossy().to_string());
                break;
            }
        }

        if let Some(parent_str) = absorbed_by {
            skipped_subfolders.push(cand_path.to_string_lossy().to_string());
            messages.push(PathProcessMessage {
                path: cand_path.to_string_lossy().to_string(),
                title: "복수 지정 내 하위 폴더 자동 통합".to_string(),
                message: format!(
                    "선택 항목 중 '{}'은(는) 함께 지정된 상위 경로 '{}'에 포함되어 있어 상위 폴더로 자동 통합되었습니다.",
                    cand_path.to_string_lossy(),
                    parent_str
                ),
                severity: MessageSeverity::Info,
                related_paths: vec![parent_str],
            });
        } else {
            deduped_candidates.push((name, cand_path));
        }
    }

    // 3. Process each candidate against existing target folders
    for (name, cand_path) in deduped_candidates {
        let cand_str = cand_path.to_string_lossy().to_string();

        // Check if duplicate of an existing target
        if current_targets.iter().any(|t| check_path_relation(&cand_path, &t.path) == PathRelation::Identical) {
            skipped_duplicates.push(cand_str.clone());
            messages.push(PathProcessMessage {
                path: cand_str.clone(),
                title: "이미 등록된 검색 대상".to_string(),
                message: format!("'{}'은(는) 이미 검색 대상 폴더/드라이브 목록에 등록되어 있습니다.", cand_str),
                severity: MessageSeverity::Info,
                related_paths: vec![cand_str],
            });
            continue;
        }

        // Check if candidate is a subfolder of an existing target
        let covering_parent = current_targets.iter().find(|t| {
            check_path_relation(&cand_path, &t.path) == PathRelation::IsSubfolder
        });

        if let Some(parent) = covering_parent {
            let parent_str = parent.path.to_string_lossy().to_string();
            skipped_subfolders.push(cand_str.clone());
            messages.push(PathProcessMessage {
                path: cand_str.clone(),
                title: "하위 폴더 감지 (상위 폴더에 이미 포함됨)".to_string(),
                message: format!(
                    "하위 폴더 감지: '{}'은(는) 이미 등록된 상위 경로 '{}'에 의해 전체 색인되므로 중복 색인 방지를 위해 별도 추가하지 않습니다.",
                    cand_str,
                    parent_str
                ),
                severity: MessageSeverity::Warning,
                related_paths: vec![parent_str],
            });
            continue;
        }

        // Check if candidate is a parent of one or more existing targets
        let children_to_replace: Vec<TargetFolder> = current_targets
            .iter()
            .filter(|t| check_path_relation(&cand_path, &t.path) == PathRelation::IsParent)
            .cloned()
            .collect();

        if !children_to_replace.is_empty() {
            let child_names: Vec<String> = children_to_replace
                .iter()
                .map(|c| c.path.to_string_lossy().to_string())
                .collect();

            // Remove the children from current_targets
            current_targets.retain(|t| {
                !children_to_replace.iter().any(|c| c.path == t.path)
            });

            for child in &child_names {
                removed_subfolders.push(child.clone());
            }

            // Add the broader parent
            current_targets.push(TargetFolder {
                name: name.clone(),
                path: cand_path.clone(),
                enabled: true,
            });
            added_paths.push(cand_str.clone());

            messages.push(PathProcessMessage {
                path: cand_str.clone(),
                title: "상위 경로 감지 및 하위 폴더 자동 통합".to_string(),
                message: format!(
                    "상위 폴더(드라이브) 감지: 새로 추가된 '{}'이(가) 기존 하위 폴더 [ {} ]를 포함하므로, 중복 스캔 방지를 위해 하위 항목을 상위 경로 하나로 흡수·통합 등록하였습니다.",
                    cand_str,
                    child_names.join(", ")
                ),
                severity: MessageSeverity::Success,
                related_paths: child_names,
            });
            continue;
        }

        // Independent folder: cleanly add
        current_targets.push(TargetFolder {
            name: name.clone(),
            path: cand_path.clone(),
            enabled: true,
        });
        added_paths.push(cand_str.clone());
        messages.push(PathProcessMessage {
            path: cand_str.clone(),
            title: "검색 대상 추가 완료".to_string(),
            message: format!("'{}'이(가) 검색 대상 목록에 정상 추가되었습니다.", cand_str),
            severity: MessageSeverity::Success,
            related_paths: vec![],
        });
    }

    TargetProcessReport {
        success: !added_paths.is_empty() || !skipped_subfolders.is_empty() || !skipped_duplicates.is_empty(),
        added_paths,
        removed_subfolders,
        skipped_subfolders,
        skipped_duplicates,
        messages,
        current_targets: current_targets.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_relations() {
        let p_root = Path::new(r"C:\");
        let p_proj = Path::new(r"C:\Projects");
        let p_sub = Path::new(r"C:\Projects\RAG_EmbeddingGemma2");
        let p_sibling = Path::new(r"C:\Projects_Other");
        let p_d_drive = Path::new(r"D:\Data");

        // Identical
        assert_eq!(check_path_relation(p_proj, Path::new(r"c:\projects\")), PathRelation::Identical);

        // Parent & Subfolder
        assert_eq!(check_path_relation(p_sub, p_proj), PathRelation::IsSubfolder);
        assert_eq!(check_path_relation(p_proj, p_sub), PathRelation::IsParent);

        // Drive Root & Subfolder
        assert_eq!(check_path_relation(p_proj, p_root), PathRelation::IsSubfolder);
        assert_eq!(check_path_relation(p_root, p_proj), PathRelation::IsParent);

        // Sibling (no prefix collision)
        assert_eq!(check_path_relation(p_proj, p_sibling), PathRelation::Independent);
        assert_eq!(check_path_relation(p_sibling, p_proj), PathRelation::Independent);

        // Different drive
        assert_eq!(check_path_relation(p_d_drive, p_proj), PathRelation::Independent);
    }

    #[test]
    fn test_prune_subdirectories() {
        let dirs = vec![
            PathBuf::from(r"C:\Projects\App"),
            PathBuf::from(r"C:\Projects"),
            PathBuf::from(r"D:\Data"),
            PathBuf::from(r"C:\Projects\App\Sub"),
        ];

        let pruned = prune_subdirectories(dirs);
        assert_eq!(pruned.len(), 2);
        let names: Vec<String> = pruned.iter().map(|p| normalize_dir_string(p)).collect();
        assert!(names.contains(&"c:/projects".to_string()));
        assert!(names.contains(&"d:/data".to_string()));
    }

    #[test]
    fn test_validate_and_apply_targets_hierarchy() {
        let temp_dir = std::env::temp_dir().join(format!("eg2_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let parent = temp_dir.join("parent");
        let child1 = parent.join("child1");
        let child2 = parent.join("child2");
        let sibling = temp_dir.join("sibling");

        std::fs::create_dir_all(&child1).unwrap();
        std::fs::create_dir_all(&child2).unwrap();
        std::fs::create_dir_all(&sibling).unwrap();

        let mut targets = vec![
            TargetFolder {
                name: "Child1".to_string(),
                path: child1.clone(),
                enabled: true,
            }
        ];

        // 1. Add subfolder of existing -> should be skipped
        let sub_of_child1 = child1.join("sub");
        std::fs::create_dir_all(&sub_of_child1).unwrap();
        let report1 = validate_and_apply_targets(&mut targets, vec![
            FolderAddInput { name: None, path: sub_of_child1.to_string_lossy().to_string() }
        ]);
        assert_eq!(report1.skipped_subfolders.len(), 1);
        assert_eq!(targets.len(), 1);

        // 2. Add parent of existing -> should replace child1 with parent
        let report2 = validate_and_apply_targets(&mut targets, vec![
            FolderAddInput { name: Some("Parent".to_string()), path: parent.to_string_lossy().to_string() }
        ]);
        assert_eq!(report2.added_paths.len(), 1);
        assert_eq!(report2.removed_subfolders.len(), 1);
        assert_eq!(targets.len(), 1);
        assert_eq!(dunce::canonicalize(&targets[0].path).unwrap(), dunce::canonicalize(&parent).unwrap());

        // 3. Clean up
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
