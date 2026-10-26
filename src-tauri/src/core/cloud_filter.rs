use std::path::Path;

#[cfg(windows)]
use std::os::windows::fs::MetadataExt;

pub const FILE_ATTRIBUTE_OFFLINE: u32 = 0x00001000;
pub const FILE_ATTRIBUTE_RECALL_ON_OPEN: u32 = 0x00040000;
pub const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x00400000;

/// Checks if a file is a cloud placeholder (e.g. OneDrive/iCloud Files On-Demand)
/// WITHOUT opening the file stream or triggering downloads.
/// Returns true if the file should be skipped.
pub fn is_cloud_placeholder(path: &Path) -> bool {
    #[cfg(windows)]
    {
        // Use symlink_metadata to avoid opening or following placeholders
        if let Ok(meta) = std::fs::symlink_metadata(path) {
            let attrs = meta.file_attributes();
            let is_recall = (attrs & FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS) != 0
                || (attrs & FILE_ATTRIBUTE_RECALL_ON_OPEN) != 0
                || (attrs & FILE_ATTRIBUTE_OFFLINE) != 0;
            return is_recall;
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
}
