package com.geoguard.api.dto;

import com.geoguard.domain.HazardStatus;

import java.time.Instant;

public record TelemetryView(
        long id,
        String droneId,
        Instant recordedAt,
        double longitude,
        double latitude,
        double altitude,
        Double heading,
        Double speed,
        HazardStatus status,
        Long nearestZoneId,
        String nearestZoneName,
        Double distanceMeters
) {
}
