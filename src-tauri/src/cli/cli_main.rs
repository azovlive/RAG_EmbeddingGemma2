use std::sync::Arc;
use clap::{Parser, Subcommand};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::RwLock;
use serde_json::Value;

use crate::core::daemon_ipc::{PIPE_NAME, IpcRequest, IpcResponse};
use crate::cli::mcp_server::run_mcp_server;
use crate::core::config::{AppConfig, get_default_base_dir};
use crate::core::db::VectorDatabase;
use crate::core::embedder::Embedder;
use crate::core::resource_governor::ResourceGovernor;
use crate::core::indexer::Indexer;
use crate::core::bundle::normalize_path_for_query;

#[derive(Parser, Debug)]
#[command(name = "eg2-rag")]
#[command(about = "High-performance Local Semantic Search & MCP Agent for Windows 11 & macOS Apple Silicon", long_about = None)]
pub struct CliArgs {
    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Execute semantic search query across indexed documents
    Query {
        /// Search query text
        query: String,

        /// Knowledge Bundle ID filter (e.g. 'python-code', 'cpp-code', 'markdown-notes')
        #[arg(short, long)]
        bundle: Option<String>,

        /// Maximum results to return
        #[arg(short = 'k', long, default_value = "5")]
        top_k: usize,

        /// Output results in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Find files similar to a specified file
    Similar {
        /// Target file path
        file: String,

        /// Maximum results to return
        #[arg(short = 'k', long, default_value = "5")]
        top_k: usize,

        /// Output results in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Show system metrics, index count, and daemon status
    Status,

    /// Trigger background indexing
    Index,

    /// Start Model Context Protocol (MCP) stdio server
    Mcp,
}

pub async fn run_cli(args: CliArgs) -> anyhow::Result<()> {
    match args.command {
        Some(Commands::Mcp) => {
            run_mcp_server().await?;
        }
        Some(Commands::Query { query, bundle, top_k, json }) => {
            let req = IpcRequest::Search {
                query: query.clone(),
                bundle_id: bundle,
                top_k: Some(top_k),
            };
            let resp = send_ipc_or_standalone(req).await;
            match resp {
                Ok(data) => {
                    if json {
                        println!("{}", serde_json::to_string_pretty(&data)?);
                    } else if let Some(items) = data.as_array() {
                        println!("\n🔍 검색 결과 (Query: '{}'):", query);
                        println!("============================================================");
                        for (idx, item) in items.iter().enumerate() {
                            let score = item.get("score").and_then(|s| s.as_f64()).unwrap_or(0.0) * 100.0;
                            let chunk = item.get("chunk").unwrap_or(&Value::Null);
                            let path = chunk.get("display_path").and_then(|p| p.as_str()).unwrap_or("");
                            let symbol = chunk.get("symbol").and_then(|s| s.as_str()).unwrap_or("");
                            let lines = format!("L{}-L{}",
                                chunk.get("start_line").and_then(|l| l.as_u64()).unwrap_or(1),
                                chunk.get("end_line").and_then(|l| l.as_u64()).unwrap_or(1)
                            );
                            let content = chunk.get("content").and_then(|c| c.as_str()).unwrap_or("");
                            let snippet: String = content.lines().take(3).collect::<Vec<_>>().join("\n");

                            println!("[{}] {:.1}% | {} ({})", idx + 1, score, path, lines);
                            if !symbol.is_empty() {
                                println!("    Symbol: {}", symbol);
                            }
                            println!("    {}", snippet.replace('\n', "\n    "));
                            println!("------------------------------------------------------------");
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error: {}", e);
                }
            }
        }
        Some(Commands::Similar { file, top_k, json }) => {
            let req = IpcRequest::SimilarFiles {
                file_path: file.clone(),
                top_k: Some(top_k),
            };
            let resp = send_ipc_or_standalone(req).await;
            match resp {
                Ok(data) => {
                    if json {
                        println!("{}", serde_json::to_string_pretty(&data)?);
                    } else if let Some(items) = data.as_array() {
                        println!("\n📂 유사 파일 목록 (File: '{}'):", file);
                        println!("============================================================");
                        for (idx, item) in items.iter().enumerate() {
                            let score = item.get("score").and_then(|s| s.as_f64()).unwrap_or(0.0) * 100.0;
                            let path = item.get("display_path").and_then(|p| p.as_str()).unwrap_or("");
                            println!("[{}] {:.1}% | {}", idx + 1, score, path);
                        }
                    }
                }
                Err(e) => eprintln!("Error: {}", e),
            }
        }
        Some(Commands::Status) => {
            let req = IpcRequest::Status;
            match send_ipc_or_standalone(req).await {
                Ok(data) => {
                    println!("\n📊 eg2-rag 상태:");
                    println!("{}", serde_json::to_string_pretty(&data)?);
                }
                Err(e) => eprintln!("Error: {}", e),
            }
        }
        Some(Commands::Index) => {
            println!("🔄 색인 작업을 시작합니다...");
            let req = IpcRequest::TriggerIndex;
            match send_ipc_or_standalone(req).await {
                Ok(data) => {
                    let total = data.get("total_chunks").and_then(|t| t.as_u64()).unwrap_or(0);
                    println!("✅ 색인 작업이 성공적으로 완료되었습니다 (총 청크 수: {}개)", total);
                }
                Err(e) => eprintln!("Error: {}", e),
            }
        }
        None => {
            println!("eg2-rag v0.1.0 - Use --help to view available commands or run without arguments to start the GUI.");
        }
    }
    Ok(())
}

async fn send_ipc_or_standalone(req: IpcRequest) -> anyhow::Result<Value> {
    match send_ipc_request(req.clone()).await {
        Ok(v) => Ok(v),
        Err(_) => {
            // Daemon is offline: execute directly in standalone mode
            execute_standalone(req).await
        }
    }
}

async fn send_ipc_request(req: IpcRequest) -> anyhow::Result<Value> {
    #[cfg(target_os = "windows")]
    let client = {
        use tokio::net::windows::named_pipe::ClientOptions;
        ClientOptions::new().open(PIPE_NAME).map_err(|e| {
            anyhow::anyhow!("Named Pipe connect failed: {}", e)
        })?
    };

    #[cfg(not(target_os = "windows"))]
    let client = {
        tokio::net::UnixStream::connect(PIPE_NAME).await.map_err(|e| {
            anyhow::anyhow!("Unix Socket connect failed: {}", e)
        })?
    };

    let (reader, mut writer) = tokio::io::split(client);
    let mut req_str = serde_json::to_string(&req)?;
    req_str.push('\n');

    writer.write_all(req_str.as_bytes()).await?;
    writer.flush().await?;

    let mut lines = BufReader::new(reader).lines();
    if let Ok(Some(line)) = lines.next_line().await {
        let resp: IpcResponse = serde_json::from_str(&line)?;
        if resp.success {
            return Ok(resp.data.unwrap_or(Value::Null));
        } else {
            return Err(anyhow::anyhow!(resp.error.unwrap_or_else(|| "Unknown error".into())));
        }
    }

    Err(anyhow::anyhow!("서버로부터 응답이 없습니다."))
}

async fn execute_standalone(req: IpcRequest) -> anyhow::Result<Value> {
    let base_dir = get_default_base_dir();
    let config_data = AppConfig::load_from_dir(&base_dir)?;
    let config = Arc::new(RwLock::new(config_data.clone()));

    let db = Arc::new(VectorDatabase::new(config_data.storage.lancedb_dir.clone()));
    let _ = db.load().await;

    let embedder = Arc::new(Embedder::new(
        &config_data.inference.device,
        config_data.inference.vector_dim,
    ));

    let governor = Arc::new(ResourceGovernor::new(
        config_data.resource_governor.max_cpu_percent,
        config_data.resource_governor.max_ram_percent,
        config_data.resource_governor.enabled,
    ));

    let indexer = Arc::new(Indexer::new(
        config.clone(),
        db.clone(),
        embedder.clone(),
        governor.clone(),
    ));

    match req {
        IpcRequest::Search { query, bundle_id, top_k } => {
            let k = top_k.unwrap_or(10);
            let q_vec = embedder.embed(&query).await?;
            let mut path_filters = Vec::new();
            let mut ext_filters = Vec::new();

            if let Some(b_id) = bundle_id {
                let conf = config.read().await;
                if let Some(b) = conf.bundles.iter().find(|item| item.id == b_id) {
                    path_filters = b.paths.iter().map(|p| normalize_path_for_query(p)).collect();
                    ext_filters = b.extensions.clone();
                }
            }

            let results = db.search_vectors(&q_vec, &path_filters, &ext_filters, k).await?;
            Ok(serde_json::to_value(results)?)
        }
        IpcRequest::SimilarFiles { file_path, top_k } => {
            let k = top_k.unwrap_or(5);
            let results = db.get_similar_files(&file_path, k).await?;
            Ok(serde_json::to_value(results)?)
        }
        IpcRequest::FileContext { file_path } => {
            let ctx = db.get_file_context(&file_path, 1, 500, 20).await?;
            Ok(serde_json::to_value(ctx)?)
        }
        IpcRequest::Status => {
            let total = db.get_total_chunks().await;
            let conf = config.read().await;
            Ok(serde_json::json!({
                "mode": "standalone",
                "base_dir": base_dir,
                "target_paths": conf.indexing.target_paths,
                "total_chunks": total
            }))
        }
        IpcRequest::TriggerIndex => {
            let (tx, mut rx) = tokio::sync::mpsc::channel::<crate::core::indexer::IndexProgress>(100);
            let print_handle = tokio::spawn(async move {
                while let Some(prog) = rx.recv().await {
                    println!("  [{:.0}%] {}", prog.percent, prog.current_file);
                }
            });

            indexer.index_all(None, false, Some(tx)).await?;
            let _ = print_handle.await;

            let total = db.get_total_chunks().await;
            Ok(serde_json::json!({
                "action": "index_completed",
                "total_chunks": total
            }))
        }
    }
}
