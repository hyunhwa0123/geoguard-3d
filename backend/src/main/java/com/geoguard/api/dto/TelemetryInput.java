package com.geoguard.api.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record TelemetryInput(
        @NotBlank @Size(max = 64) String droneId,
        @NotNull Instant recordedAt,
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
        @NotNull @DecimalMin("-500.0") @DecimalMax("20000.0") Double altitude,
        @DecimalMin("0.0") @DecimalMax(value = "360.0", inclusive = false) Double heading,
        @DecimalMin("0.0") Double speed
) {
}
