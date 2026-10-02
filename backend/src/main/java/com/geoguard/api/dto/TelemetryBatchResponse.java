package com.geoguard.api.dto;

import java.util.List;

public record TelemetryBatchResponse(int accepted, List<TelemetryView> items) {
}
