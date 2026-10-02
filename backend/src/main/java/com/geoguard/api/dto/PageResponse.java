package com.geoguard.api.dto;

import java.util.List;

public record PageResponse<T>(
        List<T> items,
        int page,
        int size,
        long total,
        int totalPages,
        SearchMetadata searchMetadata
) {
    public static <T> PageResponse<T> of(List<T> items, int page, int size, long total) {
        int totalPages = size == 0 ? 0 : (int) Math.ceil((double) total / size);
        return new PageResponse<>(items, page, size, total, totalPages, null);
    }

    public PageResponse<T> withSearchMetadata(SearchMetadata metadata) {
        return new PageResponse<>(items, page, size, total, totalPages, metadata);
    }
}
