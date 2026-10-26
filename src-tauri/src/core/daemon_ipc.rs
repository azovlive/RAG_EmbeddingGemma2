use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::ServerOptions;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use tracing::{info, error, warn};

use crate::core::config::AppConfig;
use crate::core::db::VectorDatabase;
use crate::core::embedder::Embedder;
use crate::core::bundle::normalize_path_for_query;

pub const PIPE_NAME: &str = r"\\.\pipe\eg2-rag-daemon";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", content = "payload")]
pub enum IpcRequest {
    Search {
        query: String,
        bundle_id: Option<String>,
        top_k: Option<usize>,
    },
    SimilarFiles {
        file_path: String,
        top_k: Option<usize>,
    },
    FileContext {
        file_path: String,
    },
    Status,
    TriggerIndex,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IpcResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

pub struct DaemonIpcServer {
    db: Arc<VectorDatabase>,
    embedder: Arc<Embedder>,
    config: Arc<RwLock<AppConfig>>,
}

impl DaemonIpcServer {
    pub fn new(
        db: Arc<VectorDatabase>,
        embedder: Arc<Embedder>,
        config: Arc<RwLock<AppConfig>>,
    ) -> Self {
        Self {
            db,
            embedder,
            config,
        }
    }

    pub async fn run(&self) {
        info!("Starting Named Pipe IPC Server on {}", PIPE_NAME);

        loop {
            let server = match ServerOptions::new()
                .first_pipe_instance(false)
                .create(PIPE_NAME)
            {
                Ok(s) => s,
                Err(e) => {
                    error!("Failed to create named pipe instance: {:?}", e);
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    continue;
                }
            };

            if let Err(e) = server.connect().await {
                warn!("Pipe client connect failed: {:?}", e);
                continue;
            }

            let db = self.db.clone();
            let embedder = self.embedder.clone();
            let config = self.config.clone();

            tokio::spawn(async move {
                let (reader, mut writer) = tokio::io::split(server);
                let mut lines = BufReader::new(reader).lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    let req: Result<IpcRequest, _> = serde_json::from_str(&line);
                    let resp = match req {
                        Ok(IpcRequest::Search { query, bundle_id, top_k }) => {
                            let k = top_k.unwrap_or(10);
                            match embedder.embed(&query).await {
                                Ok(q_vec) => {
                                    let mut path_filters = Vec::new();
                                    let mut ext_filters = Vec::new();

                                    if let Some(b_id) = bundle_id {
                                        let conf = config.read().await;
                                        if let Some(b) = conf.bundles.iter().find(|item| item.id == b_id) {
                                            path_filters = b.paths.iter().map(|p| normalize_path_for_query(p)).collect();
                                            ext_filters = b.extensions.clone();
                                        }
                                    }

                                    match db.search_vectors(&q_vec, &path_filters, &ext_filters, k).await {
                                        Ok(results) => IpcResponse {
                                            success: true,
                                            data: Some(serde_json::to_value(results).unwrap_or_default()),
                                            error: None,
                                        },
                                        Err(e) => IpcResponse {
                                            success: false,
                                            data: None,
                                            error: Some(e.to_string()),
                                        },
                                    }
                                }
                                Err(e) => IpcResponse {
                                    success: false,
                                    data: None,
                                    error: Some(e.to_string()),
                                },
                            }
                        }
                        Ok(IpcRequest::SimilarFiles { file_path, top_k }) => {
                            let k = top_k.unwrap_or(5);
                            match db.get_similar_files(&file_path, k).await {
                                Ok(res) => IpcResponse {
                                    success: true,
                                    data: Some(serde_json::to_value(res).unwrap_or_default()),
                                    error: None,
                                },
                                Err(e) => IpcResponse {
                                    success: false,
                                    data: None,
                                    error: Some(e.to_string()),
                                },
                            }
                        }
                        Ok(IpcRequest::FileContext { file_path }) => {
                            match db.get_file_context(&file_path, 1, 500, 20).await {
                                Ok(res) => IpcResponse {
                                    success: true,
                                    data: Some(serde_json::to_value(res).unwrap_or_default()),
                                    error: None,
                                },
                                Err(e) => IpcResponse {
                                    success: false,
                                    data: None,
                                    error: Some(e.to_string()),
                                },
                            }
                        }
                        Ok(IpcRequest::Status) => {
                            let total = db.get_total_chunks().await;
                            let status = serde_json::json!({
                                "status": "running",
                                "total_chunks": total,
                                "pipe": PIPE_NAME,
                            });
                            IpcResponse {
                                success: true,
                                data: Some(status),
                                error: None,
                            }
                        }
                        Ok(IpcRequest::TriggerIndex) => {
                            IpcResponse {
                                success: true,
                                data: Some(serde_json::json!({"action": "index_triggered"})),
                                error: None,
                            }
                        }
                        Err(e) => IpcResponse {
                            success: false,
                            data: None,
                            error: Some(format!("Invalid request format: {}", e)),
                        },
                    };

                    let mut resp_str = serde_json::to_string(&resp).unwrap_or_default();
                    resp_str.push('\n');
                    if let Err(e) = writer.write_all(resp_str.as_bytes()).await {
                        error!("Failed to write IPC response: {:?}", e);
                        break;
                    }
                    let _ = writer.flush().await;
                }
            });
        }
    }
}
