package com.geoguard.api.dto;

import java.util.List;

public record TrackResponse(String droneId, int count, List<TelemetryView> items) {
}
