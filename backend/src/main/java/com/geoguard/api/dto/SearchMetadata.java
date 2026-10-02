package com.geoguard.api.dto;

import java.util.List;

public record SearchMetadata(
        double queryTimeMs,
        List<String> appliedFilters,
        List<String> candidateIndexes
) {
}
