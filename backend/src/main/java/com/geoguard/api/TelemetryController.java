package com.geoguard.api;

import com.geoguard.api.dto.PageResponse;
import com.geoguard.api.dto.TelemetryBatchRequest;
import com.geoguard.api.dto.TelemetryBatchResponse;
import com.geoguard.api.dto.TelemetryView;
import com.geoguard.api.dto.TrackResponse;
import com.geoguard.domain.BoundingBox;
import com.geoguard.domain.HazardStatus;
import com.geoguard.service.TelemetryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api")
@Validated
@Tag(name = "Telemetry", description = "드론 위치 수집 및 시공간 검색")
public class TelemetryController {
    private final TelemetryService telemetryService;

    public TelemetryController(TelemetryService telemetryService) {
        this.telemetryService = telemetryService;
    }

    @PostMapping("/telemetry/batch")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "텔레메트리 일괄 수집", description = "최대 1,000건을 판정·저장하고 커밋 후 WebSocket으로 전송합니다.")
    public TelemetryBatchResponse ingest(@Valid @RequestBody TelemetryBatchRequest request) {
        return telemetryService.ingest(request);
    }

    @GetMapping("/telemetry")
    @Operation(summary = "텔레메트리 검색")
    public PageResponse<TelemetryView> search(
            @RequestParam(required = false) @Size(max = 64) String droneId,
            @Parameter(description = "minLon,minLat,maxLon,maxLat") @RequestParam(required = false) String bbox,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) HazardStatus status,
            @RequestParam(required = false) Double zoneDistanceMeters,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "200") @Min(1) @Max(1_000) int size) {
        return telemetryService.search(droneId, BoundingBox.parse(bbox), from, to, status,
                zoneDistanceMeters, page, size);
    }

    @GetMapping("/drones/{id}/track")
    @Operation(summary = "드론 비행 경로 조회", description = "시간순으로 정렬된 위치를 최대 limit건 반환합니다.")
    public TrackResponse track(
            @PathVariable @Size(min = 1, max = 64) String id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "5000") @Min(1) @Max(10_000) int limit) {
        return telemetryService.track(id, from, to, limit);
    }
}
