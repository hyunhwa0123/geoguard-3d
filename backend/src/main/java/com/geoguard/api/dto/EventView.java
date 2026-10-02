package com.geoguard.api.dto;

import com.geoguard.domain.HazardStatus;

import java.time.Instant;

public record EventView(
        long id,
        long telemetryId,
        String droneId,
        Instant recordedAt,
        HazardStatus status,
        long zoneId,
        String zoneName,
        double distanceMeters,
        double longitude,
        double latitude,
        double altitude
) {
}
