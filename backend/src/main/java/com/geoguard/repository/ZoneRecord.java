package com.geoguard.repository;

public record ZoneRecord(long id, String name, String boundaryGeoJson,
                         double minAltitude, double maxAltitude, String description) {
}
