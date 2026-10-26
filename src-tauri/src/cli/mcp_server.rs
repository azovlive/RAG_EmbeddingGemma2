use std::io::{self, BufRead, Write};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::ClientOptions;
use serde_json::{json, Value};
use crate::core::daemon_ipc::{PIPE_NAME, IpcRequest, IpcResponse};

pub async fn run_mcp_server() -> anyhow::Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut handle = stdout.lock();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let req: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let id = req.get("id").cloned().unwrap_or(Value::Null);
        let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");

        let resp = match method {
            "initialize" => {
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "serverInfo": {
                            "name": "eg2-rag-mcp",
                            "version": "0.1.0"
                        },
                        "capabilities": {
                            "tools": {}
                        }
                    }
                })
            }
            "tools/list" => {
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "tools": [
                            {
                                "name": "semantic_search",
                                "description": "Search local documents and codebase using EmbeddingGemma-2 semantic vector index",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "query": { "type": "string", "description": "Natural language or code query" },
                                        "bundle_id": { "type": "string", "description": "Optional Knowledge Bundle ID (e.g., 'python-code', 'cpp-code', 'markdown-notes')" },
                                        "top_k": { "type": "number", "description": "Number of results to return (default: 5)" }
                                    },
                                    "required": ["query"]
                                }
                            },
                            {
                                "name": "get_similar_files",
                                "description": "Find files structurally or semantically similar to a given file path",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "file_path": { "type": "string", "description": "Absolute or normalized file path" },
                                        "top_k": { "type": "number", "description": "Number of similar files (default: 5)" }
                                    },
                                    "required": ["file_path"]
                                }
                            },
                            {
                                "name": "get_file_context",
                                "description": "Retrieve all indexed chunks and AST symbols for a specific file",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "file_path": { "type": "string", "description": "Absolute or normalized file path" }
                                    },
                                    "required": ["file_path"]
                                }
                            }
                        ]
                    }
                })
            }
            "tools/call" => {
                let params = req.get("params").cloned().unwrap_or(Value::Null);
                let tool_name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(Value::Null);

                let result_value = call_daemon_tool(tool_name, args).await;
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": serde_json::to_string_pretty(&result_value).unwrap_or_default()
                            }
                        ]
                    }
                })
            }
            _ => {
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {
                        "code": -32601,
                        "message": format!("Method not found: {}", method)
                    }
                })
            }
        };

        let mut out_str = serde_json::to_string(&resp).unwrap_or_default();
        out_str.push('\n');
        let _ = handle.write_all(out_str.as_bytes());
        let _ = handle.flush();
    }

    Ok(())
}

async fn call_daemon_tool(tool_name: &str, args: Value) -> Value {
    // Connect to named pipe
    let client = match ClientOptions::new().open(PIPE_NAME) {
        Ok(c) => c,
        Err(e) => {
            return json!({
                "error": format!("Cannot connect to eg2-rag background daemon ({}). Please make sure eg2-rag is running.", e)
            });
        }
    };

    let req = match tool_name {
        "semantic_search" => {
            let query = args.get("query").and_then(|q| q.as_str()).unwrap_or("").to_string();
            let bundle_id = args.get("bundle_id").and_then(|b| b.as_str()).map(|s| s.to_string());
            let top_k = args.get("top_k").and_then(|k| k.as_u64()).map(|n| n as usize);
            IpcRequest::Search { query, bundle_id, top_k }
        }
        "get_similar_files" => {
            let file_path = args.get("file_path").and_then(|f| f.as_str()).unwrap_or("").to_string();
            let top_k = args.get("top_k").and_then(|k| k.as_u64()).map(|n| n as usize);
            IpcRequest::SimilarFiles { file_path, top_k }
        }
        "get_file_context" => {
            let file_path = args.get("file_path").and_then(|f| f.as_str()).unwrap_or("").to_string();
            IpcRequest::FileContext { file_path }
        }
        _ => return json!({"error": format!("Unknown tool: {}", tool_name)}),
    };

    let (reader, mut writer) = tokio::io::split(client);
    let mut req_str = match serde_json::to_string(&req) {
        Ok(s) => s,
        Err(e) => return json!({"error": e.to_string()}),
    };
    req_str.push('\n');

    if let Err(e) = writer.write_all(req_str.as_bytes()).await {
        return json!({"error": format!("Write error to IPC: {}", e)});
    }
    let _ = writer.flush().await;

    let mut lines = BufReader::new(reader).lines();
    if let Ok(Some(line)) = lines.next_line().await {
        if let Ok(ipc_resp) = serde_json::from_str::<IpcResponse>(&line) {
            if ipc_resp.success {
                return ipc_resp.data.unwrap_or(Value::Null);
            } else {
                return json!({"error": ipc_resp.error.unwrap_or_else(|| "Unknown daemon error".into())});
            }
        }
    }

    json!({"error": "Failed to read response from daemon"})
}
