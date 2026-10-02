package com.geoguard.service;

import com.geoguard.api.dto.TelemetryView;

import java.util.List;

public record TelemetryAcceptedEvent(List<TelemetryView> items) {
    public TelemetryAcceptedEvent {
        items = List.copyOf(items);
    }
}
