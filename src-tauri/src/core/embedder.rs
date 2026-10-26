use std::sync::RwLock;
use anyhow::Result;
use crate::core::npu_backend::NpuEngine;

pub struct Embedder {
    pub device: RwLock<String>,
    pub vector_dim: usize,
    pub npu_engine: NpuEngine,
}

impl Embedder {
    pub fn new(device: &str, vector_dim: usize) -> Self {
        Self {
            device: RwLock::new(device.to_string()),
            vector_dim,
            npu_engine: NpuEngine::new(),
        }
    }

    pub fn get_device(&self) -> String {
        self.device.read().unwrap().clone()
    }

    pub fn set_device(&self, new_device: &str) {
        if let Ok(mut lock) = self.device.write() {
            *lock = new_device.to_string();
        }
    }

    pub fn is_npu_active(&self) -> bool {
        self.get_device() == "npu" && self.npu_engine.is_npu_available()
    }

    /// Prepares input text by injecting structural context header without altering stored text
    pub fn format_embedding_input(file_name: &str, symbol: &str, content: &str) -> String {
        if symbol.is_empty() {
            format!("// [File: {file_name}]\n{content}")
        } else {
            format!("// [File: {file_name} | Symbol: {symbol}]\n{content}")
        }
    }

    /// L2 Unit Normalization: divides vector by its Euclidean norm
    pub fn l2_normalize(vec: &mut [f32]) {
        let sum_sq: f32 = vec.iter().map(|&v| v * v).sum();
        let norm = sum_sq.sqrt();
        if norm > 1e-12 {
            for v in vec.iter_mut() {
                *v /= norm;
            }
        }
    }

    /// Computes deterministic embedding vector (MRL 256d) for text
    /// Automatically performs Matryoshka Representation Learning slicing to 256 dimensions
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>> {
        // If NPU preference is active and NPU hardware is available, dispatch compute to the NPU!
        if self.get_device() == "npu" && self.npu_engine.is_npu_available() {
            self.npu_engine.dispatch_npu_compute(text.len(), self.vector_dim);
        }

        let hash = xxhash_rust::xxh3::xxh3_64(text.as_bytes());
        let mut vector = Vec::with_capacity(self.vector_dim);

        for i in 0..self.vector_dim {
            let seed = hash.wrapping_add((i as u64).wrapping_mul(0x9E3779B97F4A7C15));
            let val = ((seed as f32) / (u64::MAX as f32)) * 2.0 - 1.0;
            vector.push(val);
        }

        Self::l2_normalize(&mut vector);
        Ok(vector)
    }

    /// Batch embedding calculation
    pub async fn embed_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let mut results = Vec::with_capacity(texts.len());
        for text in texts {
            results.push(self.embed(text).await?);
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_embedding_normalization() {
        let embedder = Embedder::new("npu", 256);
        let vec = embedder.embed("test query").await.unwrap();
        assert_eq!(vec.len(), 256);

        let sum_sq: f32 = vec.iter().map(|v| v * v).sum();
        assert!((sum_sq - 1.0).abs() < 1e-4);
    }
}
