#include "vector_simd.hpp"
#include <cmath>
#include <stdexcept>
#include <immintrin.h>

namespace eg2::simd {

SimdVectorEngine::SimdVectorEngine(size_t dimension)
    : dimension_(dimension) {}

float SimdVectorEngine::dot_product(const float* a, const float* b, size_t size) const {
    if (!a || !b) {
        throw std::invalid_argument("Null vector buffer passed to dot_product");
    }

    float sum = 0.0f;
    size_t i = 0;

#if defined(__AVX2__)
    __m256 acc = _mm256_setzero_ps();
    for (; i + 8 <= size; i += 8) {
        __m256 va = _mm256_loadu_ps(a + i);
        __m256 vb = _mm256_loadu_ps(b + i);
        acc = _mm256_fmadd_ps(va, vb, acc);
    }

    // Horizontal sum of acc
    alignas(32) float buffer[8];
    _mm256_store_ps(buffer, acc);
    for (int k = 0; k < 8; ++k) {
        sum += buffer[k];
    }
#endif

    // Scalar fallback for remaining elements
    for (; i < size; ++i) {
        sum += a[i] * b[i];
    }

    return sum;
}

void SimdVectorEngine::l2_normalize(std::vector<float>& vec) const {
    float dot = dot_product(vec.data(), vec.data(), vec.size());
    float norm = std::sqrt(dot);
    if (norm > 1e-12f) {
        float inv = 1.0f / norm;
        for (float& v : vec) {
            v *= inv;
        }
    }
}

std::vector<float> SimdVectorEngine::batch_similarity(
    const std::vector<float>& query,
    const std::vector<std::vector<float>>& targets) const {
    std::vector<float> results;
    results.reserve(targets.size());

    for (const auto& target : targets) {
        float sim = dot_product(query.data(), target.data(), query.size());
        results.push_back(sim);
    }
    return results;
}

} // namespace eg2::simd
