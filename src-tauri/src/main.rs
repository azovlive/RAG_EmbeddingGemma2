#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use windows_sys::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        // Attach to the parent command line prompt if invoked from console
        unsafe {
            AttachConsole(ATTACH_PARENT_PROCESS);
        }
        let cli_args = eg2_rag::cli::cli_main::CliArgs::parse();
        eg2_rag::cli::cli_main::run_cli(cli_args).await?;
        return Ok(());
    }

    // Launch GUI
    eg2_rag::run();
    Ok(())
}
