use sysinfo::System;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct ResourceGovernor {
    sys: Arc<RwLock<System>>,
    pub max_cpu_percent: f32,
    pub max_ram_percent: f32,
    pub enabled: bool,
}

impl ResourceGovernor {
    pub fn new(max_cpu: f32, max_ram: f32, enabled: bool) -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        Self {
            sys: Arc::new(RwLock::new(sys)),
            max_cpu_percent: max_cpu,
            max_ram_percent: max_ram,
            enabled,
        }
    }

    pub async fn check_system(&self) -> (f32, f32, bool) {
        if !self.enabled {
            return (0.0, 0.0, false);
        }

        let mut sys = self.sys.write().await;
        sys.refresh_cpu_all();
        sys.refresh_memory();

        let cpu_usage = sys.global_cpu_usage();
        let total_mem = sys.total_memory() as f32;
        let used_mem = sys.used_memory() as f32;
        let ram_percent = if total_mem > 0.0 { (used_mem / total_mem) * 100.0 } else { 0.0 };

        let should_pause = cpu_usage > self.max_cpu_percent || ram_percent > self.max_ram_percent;

        (cpu_usage, ram_percent, should_pause)
    }
}
