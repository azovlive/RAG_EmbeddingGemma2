use clap::{Parser, Subcommand};
use tokio::net::windows::named_pipe::ClientOptions;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use serde_json::Value;
use crate::core::daemon_ipc::{PIPE_NAME, IpcRequest, IpcResponse};
use crate::cli::mcp_server::run_mcp_server;

#[derive(Parser, Debug)]
#[command(name = "eg2-rag")]
#[command(about = "High-performance Local Semantic Search & MCP Agent for Windows 11", long_about = None)]
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
            let resp = send_ipc_request(req).await;
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
            let resp = send_ipc_request(req).await;
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
            match send_ipc_request(req).await {
                Ok(data) => {
                    println!("\n📊 eg2-rag 데몬 상태:");
                    println!("{}", serde_json::to_string_pretty(&data)?);
                }
                Err(e) => eprintln!("Error: {}", e),
            }
        }
        Some(Commands::Index) => {
            let req = IpcRequest::TriggerIndex;
            match send_ipc_request(req).await {
                Ok(_) => println!("색인 작업이 시작되었습니다."),
                Err(e) => eprintln!("Error: {}", e),
            }
        }
        None => {
            println!("eg2-rag v0.1.0 - Use --help to view available commands or run without arguments to start the GUI.");
        }
    }
    Ok(())
}

async fn send_ipc_request(req: IpcRequest) -> anyhow::Result<Value> {
    let client = ClientOptions::new().open(PIPE_NAME).map_err(|e| {
        anyhow::anyhow!("eg2-rag 데몬에 연결할 수 없습니다 ({}). 앱이 실행 중인지 확인하세요.", e)
    })?;

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
