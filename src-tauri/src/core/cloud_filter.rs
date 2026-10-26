use std::path::Path;

#[cfg(target_os = "windows")]
use std::os::windows::fs::MetadataExt;

#[cfg(target_os = "macos")]
use std::os::macos::fs::MetadataExt;

pub const FILE_ATTRIBUTE_OFFLINE: u32 = 0x00001000;
pub const FILE_ATTRIBUTE_RECALL_ON_OPEN: u32 = 0x00040000;
pub const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x00400000;

/// macOS APFS flag for dataless cloud placeholder (iCloud Drive / FileProvider)
pub const SF_DATALESS: u32 = 0x40000000;

/// Checks if a file is a cloud placeholder (e.g. OneDrive/iCloud Files On-Demand)
/// WITHOUT opening the file stream or triggering downloads.
/// Returns true if the file should be skipped.
pub fn is_cloud_placeholder(path: &Path) -> bool {
    // Check iCloud stub file naming pattern (.filename.icloud) on all platforms
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if name.starts_with('.') && name.ends_with(".icloud") {
            return true;
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(meta) = std::fs::symlink_metadata(path) {
            let attrs = meta.file_attributes();
            let is_recall = (attrs & FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS) != 0
                || (attrs & FILE_ATTRIBUTE_RECALL_ON_OPEN) != 0
                || (attrs & FILE_ATTRIBUTE_OFFLINE) != 0;
            return is_recall;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(meta) = std::fs::symlink_metadata(path) {
            let flags = meta.st_flags();
            if (flags & SF_DATALESS) != 0 {
                return true;
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_normal_local_file_is_not_placeholder() {
        let cargo_toml = PathBuf::from("Cargo.toml");
        assert!(!is_cloud_placeholder(&cargo_toml));
    }

    #[test]
    fn test_icloud_stub_name_is_placeholder() {
        let icloud_stub = PathBuf::from(".report.pdf.icloud");
        assert!(is_cloud_placeholder(&icloud_stub));
    }
}
