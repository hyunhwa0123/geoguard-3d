package com.geoguard.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record TelemetryBatchRequest(
        @NotEmpty @Size(max = 1_000) List<@Valid TelemetryInput> items
) {
}
