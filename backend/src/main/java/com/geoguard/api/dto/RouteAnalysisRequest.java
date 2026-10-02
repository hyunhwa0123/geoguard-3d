package com.geoguard.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record RouteAnalysisRequest(
        @Size(max = 64) String droneId,
        @NotEmpty @Size(max = 5_000) List<@Valid RoutePoint> points
) {
}
