package com.geoguard.domain;

public record RiskAssessment(HazardStatus status, Long zoneId, String zoneName, double distanceMeters) {
    public static RiskAssessment safe() {
        return new RiskAssessment(HazardStatus.SAFE, null, null, 0);
    }
}
