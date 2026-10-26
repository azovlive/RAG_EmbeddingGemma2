"""
Data Processing Pipeline Module
High-performance batch processor for multimodal document embeddings.
"""

from typing import List, Dict, Any, Optional
import os
import json

class DataPipeline:
    """Manages raw document ingestion, text sanitization, and AST extraction."""
    
    def __init__(self, batch_size: int = 64, enable_cache: bool = True):
        self.batch_size = batch_size
        self.enable_cache = enable_cache
        self.processed_records: List[Dict[str, Any]] = []

    def sanitize_input(self, text: str) -> str:
        """Removes null bytes and non-printable unicode control characters."""
        if not text:
            return ""
        return "".join(ch for ch in text if ch.isprintable() or ch in ('\n', '\r', '\t'))

    def process_document(self, file_path: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Loads and converts document into chunked record entries."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Source file not found: {file_path}")
        
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        sanitized = self.sanitize_input(content)
        record = {
            "file_path": file_path,
            "char_count": len(sanitized),
            "metadata": metadata or {}
        }
        self.processed_records.append(record)
        return record

def compute_batch_statistics(records: List[Dict[str, Any]]) -> Dict[str, float]:
    """Calculates summary metrics for a collection of processed records."""
    if not records:
        return {"total_records": 0, "avg_char_length": 0.0}
    
    total_chars = sum(r.get("char_count", 0) for r in records)
    return {
        "total_records": len(records),
        "avg_char_length": total_chars / len(records)
    }
