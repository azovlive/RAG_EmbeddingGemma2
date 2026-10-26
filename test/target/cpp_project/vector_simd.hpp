#pragma once

#include <vector>
#include <cstddef>

namespace eg2::simd {

/**
 * High-performance hardware-accelerated SIMD dot product and Euclidean norm.
 */
class SimdVectorEngine {
public:
    explicit SimdVectorEngine(size_t dimension = 256);
    ~SimdVectorEngine() = default;

    // Computes dot product between two float vectors using AVX2 FMA
    float dot_product(const float* a, const float* b, size_t size) const;

    // Normalizes vector in-place to unit L2 length
    void l2_normalize(std::vector<float>& vec) const;

    // Batch cosine similarity matrix calculation
    std::vector<float> batch_similarity(const std::vector<float>& query,
                                        const std::vector<std::vector<float>>& targets) const;

private:
    size_t dimension_;
};

} // namespace eg2::simd
