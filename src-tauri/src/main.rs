#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
use windows_sys::Win32::Storage::FileSystem::{CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
use windows_sys::Win32::System::Console::{
    AttachConsole, SetStdHandle, ATTACH_PARENT_PROCESS, STD_ERROR_HANDLE, STD_OUTPUT_HANDLE,
};

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        // Attach to the parent command line prompt if invoked from console
        unsafe {
            if AttachConsole(ATTACH_PARENT_PROCESS) != 0 {
                let conout: Vec<u16> = "CONOUT$\0".encode_utf16().collect();
                let handle = CreateFileW(
                    conout.as_ptr(),
                    0x40000000 | 0x80000000, // GENERIC_WRITE | GENERIC_READ
                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    0,
                    0,
                );
                if handle != INVALID_HANDLE_VALUE {
                    SetStdHandle(STD_OUTPUT_HANDLE, handle);
                    SetStdHandle(STD_ERROR_HANDLE, handle);
                }
            }
        }

        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()?;
        let cli_args = eg2_rag::cli::cli_main::CliArgs::parse();
        rt.block_on(eg2_rag::cli::cli_main::run_cli(cli_args))?;
        return Ok(());
    }

    // Launch GUI
    eg2_rag::run();
    Ok(())
}
