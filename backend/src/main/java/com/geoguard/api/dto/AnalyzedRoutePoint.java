package com.geoguard.api.dto;

import com.geoguard.domain.HazardStatus;

import java.time.Instant;

public record AnalyzedRoutePoint(
        int sequence,
        Instant recordedAt,
        double longitude,
        double latitude,
        double altitude,
        HazardStatus status,
        Long zoneId,
        String zoneName,
        double distanceMeters
) {
}
