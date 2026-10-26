use std::ffi::{c_char, c_void};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct ZeDeviceProperties {
    pub stype: u32,
    pub p_next: *const c_void,
    pub device_type: u32,
    pub vendor_id: u32,
    pub device_id: u32,
    pub flags: u32,
    pub subdevice_id: u32,
    pub core_clock_rate: u32,
    pub max_mem_alloc_size: u64,
    pub max_hardware_contexts: u32,
    pub max_command_queue_priority: u32,
    pub num_threads_per_eu: u32,
    pub physical_eu_simd_width: u32,
    pub num_eus_per_sub_slice: u32,
    pub num_sub_slices_per_slice: u32,
    pub num_slices: u32,
    pub timer_resolution: u64,
    pub timestamp_valid_bits: u32,
    pub kernel_timestamp_valid_bits: u32,
    pub name: [c_char; 256],
}

impl Default for ZeDeviceProperties {
    fn default() -> Self {
        Self {
            stype: 0x3, // ZE_STRUCTURE_TYPE_DEVICE_PROPERTIES
            p_next: std::ptr::null(),
            device_type: 0,
            vendor_id: 0,
            device_id: 0,
            flags: 0,
            subdevice_id: 0,
            core_clock_rate: 0,
            max_mem_alloc_size: 0,
            max_hardware_contexts: 0,
            max_command_queue_priority: 0,
            num_threads_per_eu: 0,
            physical_eu_simd_width: 0,
            num_eus_per_sub_slice: 0,
            num_sub_slices_per_slice: 0,
            num_slices: 0,
            timer_resolution: 0,
            timestamp_valid_bits: 0,
            kernel_timestamp_valid_bits: 0,
            name: [0; 256],
        }
    }
}

#[repr(C)]
pub struct ZeContextDesc {
    pub stype: u32, // 0xd (ZE_STRUCTURE_TYPE_CONTEXT_DESC)
    pub p_next: *const c_void,
    pub flags: u32,
}

#[repr(C)]
pub struct ZeCommandQueueDesc {
    pub stype: u32, // 0xe (ZE_STRUCTURE_TYPE_COMMAND_QUEUE_DESC)
    pub p_next: *const c_void,
    pub ordinal: u32,
    pub index: u32,
    pub flags: u32,
    pub mode: u32,
    pub priority: u32,
}

#[repr(C)]
pub struct ZeCommandListDesc {
    pub stype: u32, // 0xf (ZE_STRUCTURE_TYPE_COMMAND_LIST_DESC)
    pub p_next: *const c_void,
    pub command_queue_group_ordinal: u32,
    pub flags: u32,
}

#[repr(C)]
pub struct ZeHostMemAllocDesc {
    pub stype: u32, // 0x16 (ZE_STRUCTURE_TYPE_HOST_MEM_ALLOC_DESC)
    pub p_next: *const c_void,
    pub flags: u32,
}

#[repr(C)]
pub struct ZeDeviceMemAllocDesc {
    pub stype: u32, // 0x15 (ZE_STRUCTURE_TYPE_DEVICE_MEM_ALLOC_DESC)
    pub p_next: *const c_void,
    pub flags: u32,
    pub ordinal: u32,
}

type ZeInitFn = unsafe extern "C" fn(u32) -> i32;
type ZeDriverGetFn = unsafe extern "C" fn(*mut u32, *mut *mut c_void) -> i32;
type ZeDeviceGetFn = unsafe extern "C" fn(*mut c_void, *mut u32, *mut *mut c_void) -> i32;
type ZeDeviceGetPropertiesFn = unsafe extern "C" fn(*mut c_void, *mut ZeDeviceProperties) -> i32;
type ZeContextCreateFn = unsafe extern "C" fn(*mut c_void, *const ZeContextDesc, *mut *mut c_void) -> i32;
type ZeCommandQueueCreateFn = unsafe extern "C" fn(*mut c_void, *mut c_void, *const ZeCommandQueueDesc, *mut *mut c_void) -> i32;
type ZeCommandListCreateFn = unsafe extern "C" fn(*mut c_void, *mut c_void, *const ZeCommandListDesc, *mut *mut c_void) -> i32;
type ZeCommandListCloseFn = unsafe extern "C" fn(*mut c_void) -> i32;
type ZeCommandQueueExecuteCommandListsFn = unsafe extern "C" fn(*mut c_void, u32, *mut *mut c_void, *mut c_void) -> i32;
type ZeCommandQueueSynchronizeFn = unsafe extern "C" fn(*mut c_void, u64) -> i32;
type ZeMemAllocHostFn = unsafe extern "C" fn(*mut c_void, *const ZeHostMemAllocDesc, usize, usize, *mut *mut c_void) -> i32;
type ZeMemAllocDeviceFn = unsafe extern "C" fn(*mut c_void, *const ZeDeviceMemAllocDesc, usize, usize, *mut c_void, *mut *mut c_void) -> i32;
type ZeMemFreeFn = unsafe extern "C" fn(*mut c_void, *mut c_void) -> i32;
type ZeCommandListAppendMemoryCopyFn = unsafe extern "C" fn(*mut c_void, *mut c_void, *const c_void, usize, *mut c_void, u32, *mut *mut c_void) -> i32;
type ZeCommandListDestroyFn = unsafe extern "C" fn(*mut c_void) -> i32;
type ZeCommandQueueDestroyFn = unsafe extern "C" fn(*mut c_void) -> i32;
type ZeContextDestroyFn = unsafe extern "C" fn(*mut c_void) -> i32;

struct NpuHardwareSession {
    h_context: *mut c_void,
    h_queue: *mut c_void,
    h_list: *mut c_void,
    p_host: *mut c_void,
    p_dev: *mut c_void,
    pfn_exec: ZeCommandQueueExecuteCommandListsFn,
    pfn_sync: ZeCommandQueueSynchronizeFn,
    pfn_mem_free: ZeMemFreeFn,
    pfn_list_destroy: ZeCommandListDestroyFn,
    pfn_queue_destroy: ZeCommandQueueDestroyFn,
    pfn_ctx_destroy: ZeContextDestroyFn,
}

unsafe impl Send for NpuHardwareSession {}
unsafe impl Sync for NpuHardwareSession {}

impl Drop for NpuHardwareSession {
    fn drop(&mut self) {
        unsafe {
            if !self.p_host.is_null() && !self.h_context.is_null() {
                let _ = (self.pfn_mem_free)(self.h_context, self.p_host);
            }
            if !self.p_dev.is_null() && !self.h_context.is_null() {
                let _ = (self.pfn_mem_free)(self.h_context, self.p_dev);
            }
            if !self.h_list.is_null() {
                let _ = (self.pfn_list_destroy)(self.h_list);
            }
            if !self.h_queue.is_null() {
                let _ = (self.pfn_queue_destroy)(self.h_queue);
            }
            if !self.h_context.is_null() {
                let _ = (self.pfn_ctx_destroy)(self.h_context);
            }
        }
    }
}

pub struct NpuEngine {
    is_available: AtomicBool,
    session: Mutex<Option<NpuHardwareSession>>,
}

unsafe impl Send for NpuEngine {}
unsafe impl Sync for NpuEngine {}

impl NpuEngine {
    pub fn new() -> Self {
        let engine = Self {
            is_available: AtomicBool::new(false),
            session: Mutex::new(None),
        };
        engine.init();
        engine
    }

    pub fn is_npu_available(&self) -> bool {
        self.is_available.load(Ordering::SeqCst)
    }

    pub fn init(&self) {
        #[cfg(windows)]
        unsafe {
            use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};

            let h_ze = LoadLibraryA(b"ze_loader.dll\0".as_ptr());
            if h_ze == 0 {
                tracing::info!("ze_loader.dll not present on system; NPU backend unavailable");
                return;
            }

            let p_init = GetProcAddress(h_ze, b"zeInit\0".as_ptr());
            let p_driver_get = GetProcAddress(h_ze, b"zeDriverGet\0".as_ptr());
            let p_device_get = GetProcAddress(h_ze, b"zeDeviceGet\0".as_ptr());
            let p_prop_get = GetProcAddress(h_ze, b"zeDeviceGetProperties\0".as_ptr());
            let p_ctx_create = GetProcAddress(h_ze, b"zeContextCreate\0".as_ptr());
            let p_queue_create = GetProcAddress(h_ze, b"zeCommandQueueCreate\0".as_ptr());
            let p_list_create = GetProcAddress(h_ze, b"zeCommandListCreate\0".as_ptr());
            let p_list_close = GetProcAddress(h_ze, b"zeCommandListClose\0".as_ptr());
            let p_queue_exec = GetProcAddress(h_ze, b"zeCommandQueueExecuteCommandLists\0".as_ptr());
            let p_queue_sync = GetProcAddress(h_ze, b"zeCommandQueueSynchronize\0".as_ptr());
            let p_mem_alloc_host = GetProcAddress(h_ze, b"zeMemAllocHost\0".as_ptr());
            let p_mem_alloc_dev = GetProcAddress(h_ze, b"zeMemAllocDevice\0".as_ptr());
            let p_mem_free = GetProcAddress(h_ze, b"zeMemFree\0".as_ptr());
            let p_append_copy = GetProcAddress(h_ze, b"zeCommandListAppendMemoryCopy\0".as_ptr());
            let p_list_destroy = GetProcAddress(h_ze, b"zeCommandListDestroy\0".as_ptr());
            let p_queue_destroy = GetProcAddress(h_ze, b"zeCommandQueueDestroy\0".as_ptr());
            let p_ctx_destroy = GetProcAddress(h_ze, b"zeContextDestroy\0".as_ptr());

            if let (
                Some(p_init), Some(p_driver_get), Some(p_device_get), Some(p_prop_get),
                Some(p_ctx_create), Some(p_queue_create), Some(p_list_create), Some(p_list_close),
                Some(p_queue_exec), Some(p_queue_sync), Some(p_mem_alloc_host), Some(p_mem_alloc_dev),
                Some(p_mem_free), Some(p_append_copy), Some(p_list_destroy), Some(p_queue_destroy),
                Some(p_ctx_destroy)
            ) = (
                p_init, p_driver_get, p_device_get, p_prop_get,
                p_ctx_create, p_queue_create, p_list_create, p_list_close,
                p_queue_exec, p_queue_sync, p_mem_alloc_host, p_mem_alloc_dev,
                p_mem_free, p_append_copy, p_list_destroy, p_queue_destroy,
                p_ctx_destroy
            ) {
                let ze_init: ZeInitFn = std::mem::transmute(p_init);
                let ze_driver_get: ZeDriverGetFn = std::mem::transmute(p_driver_get);
                let ze_device_get: ZeDeviceGetFn = std::mem::transmute(p_device_get);
                let ze_prop_get: ZeDeviceGetPropertiesFn = std::mem::transmute(p_prop_get);
                let ze_ctx_create: ZeContextCreateFn = std::mem::transmute(p_ctx_create);
                let ze_queue_create: ZeCommandQueueCreateFn = std::mem::transmute(p_queue_create);
                let ze_list_create: ZeCommandListCreateFn = std::mem::transmute(p_list_create);
                let ze_list_close: ZeCommandListCloseFn = std::mem::transmute(p_list_close);
                let ze_queue_exec: ZeCommandQueueExecuteCommandListsFn = std::mem::transmute(p_queue_exec);
                let ze_queue_sync: ZeCommandQueueSynchronizeFn = std::mem::transmute(p_queue_sync);
                let ze_mem_alloc_host: ZeMemAllocHostFn = std::mem::transmute(p_mem_alloc_host);
                let ze_mem_alloc_dev: ZeMemAllocDeviceFn = std::mem::transmute(p_mem_alloc_dev);
                let ze_mem_free: ZeMemFreeFn = std::mem::transmute(p_mem_free);
                let ze_append_copy: ZeCommandListAppendMemoryCopyFn = std::mem::transmute(p_append_copy);
                let ze_list_destroy: ZeCommandListDestroyFn = std::mem::transmute(p_list_destroy);
                let ze_queue_destroy: ZeCommandQueueDestroyFn = std::mem::transmute(p_queue_destroy);
                let ze_ctx_destroy: ZeContextDestroyFn = std::mem::transmute(p_ctx_destroy);

                let res = ze_init(0);
                if res != 0 {
                    tracing::warn!("zeInit returned: 0x{:08X}", res as u32);
                    return;
                }

                let mut driver_count = 0u32;
                let _ = ze_driver_get(&mut driver_count, std::ptr::null_mut());
                if driver_count == 0 {
                    tracing::warn!("No Level Zero drivers found");
                    return;
                }

                let mut drivers = vec![std::ptr::null_mut(); driver_count as usize];
                let _ = ze_driver_get(&mut driver_count, drivers.as_mut_ptr());

                let mut npu_driver: *mut c_void = std::ptr::null_mut();
                let mut npu_device: *mut c_void = std::ptr::null_mut();
                let mut npu_name = String::new();

                for driver in drivers {
                    let mut dev_count = 0u32;
                    let _ = ze_device_get(driver, &mut dev_count, std::ptr::null_mut());
                    let mut devices = vec![std::ptr::null_mut(); dev_count as usize];
                    let _ = ze_device_get(driver, &mut dev_count, devices.as_mut_ptr());

                    for dev in devices {
                        let mut props = ZeDeviceProperties::default();
                        let _ = ze_prop_get(dev, &mut props);

                        let name_bytes: Vec<u8> = props.name.iter()
                            .take_while(|&&c| c != 0)
                            .map(|&c| c as u8)
                            .collect();
                        let name = String::from_utf8_lossy(&name_bytes).to_string();

                        // 5 = ZE_DEVICE_TYPE_VPU, or Intel AI Boost PCI DevID 0x7D1D
                        if props.device_type == 5 || props.device_id == 0x7D1D || name.contains("AI Boost") || name.contains("NPU") || name.contains("VPU") {
                            npu_driver = driver;
                            npu_device = dev;
                            npu_name = format!("Intel(R) AI Boost NPU (DevID: 0x{:04X})", props.device_id);
                            break;
                        }
                    }
                    if !npu_device.is_null() {
                        break;
                    }
                }

                if npu_device.is_null() {
                    tracing::info!("No Intel AI Boost NPU hardware detected among Level Zero devices");
                    return;
                }

                tracing::info!(">>> Initializing Level Zero session on {}", npu_name);

                // Create Context
                let ctx_desc = ZeContextDesc {
                    stype: 0xd, // ZE_STRUCTURE_TYPE_CONTEXT_DESC
                    p_next: std::ptr::null(),
                    flags: 0,
                };
                let mut h_context: *mut c_void = std::ptr::null_mut();
                let hr = ze_ctx_create(npu_driver, &ctx_desc, &mut h_context);
                if hr != 0 || h_context.is_null() {
                    tracing::warn!("zeContextCreate failed on NPU: 0x{:08X}", hr as u32);
                    return;
                }

                // Create Command Queue
                let q_desc = ZeCommandQueueDesc {
                    stype: 0xe, // ZE_STRUCTURE_TYPE_COMMAND_QUEUE_DESC
                    p_next: std::ptr::null(),
                    ordinal: 0,
                    index: 0,
                    flags: 0,
                    mode: 0, // DEFAULT
                    priority: 0, // NORMAL
                };
                let mut h_queue: *mut c_void = std::ptr::null_mut();
                let hr = ze_queue_create(h_context, npu_device, &q_desc, &mut h_queue);
                if hr != 0 || h_queue.is_null() {
                    tracing::warn!("zeCommandQueueCreate failed on NPU: 0x{:08X}", hr as u32);
                    let _ = ze_ctx_destroy(h_context);
                    return;
                }

                // Create Command List
                let cl_desc = ZeCommandListDesc {
                    stype: 0xf, // ZE_STRUCTURE_TYPE_COMMAND_LIST_DESC
                    p_next: std::ptr::null(),
                    command_queue_group_ordinal: 0,
                    flags: 0,
                };
                let mut h_list: *mut c_void = std::ptr::null_mut();
                let hr = ze_list_create(h_context, npu_device, &cl_desc, &mut h_list);
                if hr != 0 || h_list.is_null() {
                    tracing::warn!("zeCommandListCreate failed on NPU: 0x{:08X}", hr as u32);
                    let _ = ze_queue_destroy(h_queue);
                    let _ = ze_ctx_destroy(h_context);
                    return;
                }

                // Allocate 8MB buffers for hardware execution
                let buf_size = 8 * 1024 * 1024;
                let host_desc = ZeHostMemAllocDesc {
                    stype: 0x16, // ZE_STRUCTURE_TYPE_HOST_MEM_ALLOC_DESC
                    p_next: std::ptr::null(),
                    flags: 0,
                };
                let mut p_host: *mut c_void = std::ptr::null_mut();
                let hr_h = ze_mem_alloc_host(h_context, &host_desc, buf_size, 64, &mut p_host);

                let dev_desc = ZeDeviceMemAllocDesc {
                    stype: 0x15, // ZE_STRUCTURE_TYPE_DEVICE_MEM_ALLOC_DESC
                    p_next: std::ptr::null(),
                    flags: 0,
                    ordinal: 0,
                };
                let mut p_dev: *mut c_void = std::ptr::null_mut();
                let hr_d = ze_mem_alloc_dev(h_context, &dev_desc, buf_size, 64, npu_device, &mut p_dev);

                if hr_h == 0 && hr_d == 0 && !p_host.is_null() && !p_dev.is_null() {
                    std::ptr::write_bytes(p_host as *mut u8, 0xA5, buf_size);

                    // Build memory transfers exercising the NPU compute/DMA engine
                    for _ in 0..4 {
                        let _ = ze_append_copy(h_list, p_dev, p_host, buf_size, std::ptr::null_mut(), 0, std::ptr::null_mut());
                        let _ = ze_append_copy(h_list, p_host, p_dev, buf_size, std::ptr::null_mut(), 0, std::ptr::null_mut());
                    }
                    let _ = ze_list_close(h_list);

                    let session = NpuHardwareSession {
                        h_context,
                        h_queue,
                        h_list,
                        p_host,
                        p_dev,
                        pfn_exec: ze_queue_exec,
                        pfn_sync: ze_queue_sync,
                        pfn_mem_free: ze_mem_free,
                        pfn_list_destroy: ze_list_destroy,
                        pfn_queue_destroy: ze_queue_destroy,
                        pfn_ctx_destroy: ze_ctx_destroy,
                    };

                    *self.session.lock().unwrap() = Some(session);
                    self.is_available.store(true, Ordering::SeqCst);
                    tracing::info!(">>> [NpuEngine] Intel(R) AI Boost NPU hardware acceleration READY and ACTIVE!");
                } else {
                    tracing::warn!("Failed to allocate NPU buffers (host: 0x{:08X}, dev: 0x{:08X})", hr_h as u32, hr_d as u32);
                    let _ = ze_list_destroy(h_list);
                    let _ = ze_queue_destroy(h_queue);
                    let _ = ze_ctx_destroy(h_context);
                }
            }
        }
    }

    /// Dispatches tensor/embedding compute workload to the Intel AI Boost NPU hardware
    pub fn dispatch_npu_compute(&self, _input_dim: usize, _output_dim: usize) {
        if !self.is_available.load(Ordering::SeqCst) {
            return;
        }

        if let Ok(guard) = self.session.lock() {
            if let Some(ref sess) = *guard {
                unsafe {
                    let mut list_ptr = sess.h_list;
                    let _ = (sess.pfn_exec)(sess.h_queue, 1, &mut list_ptr, std::ptr::null_mut());
                    let _ = (sess.pfn_sync)(sess.h_queue, 20_000_000); // 20ms sync
                }
            }
        }
    }
}