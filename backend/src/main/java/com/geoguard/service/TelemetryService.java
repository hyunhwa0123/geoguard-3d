package com.geoguard.service;

import com.geoguard.api.dto.PageResponse;
import com.geoguard.api.dto.SearchMetadata;
import com.geoguard.api.dto.TelemetryBatchRequest;
import com.geoguard.api.dto.TelemetryBatchResponse;
import com.geoguard.api.dto.TelemetryView;
import com.geoguard.api.dto.TrackResponse;
import com.geoguard.domain.BoundingBox;
import com.geoguard.domain.HazardStatus;
import com.geoguard.domain.RiskAssessment;
import com.geoguard.error.BadRequestException;
import com.geoguard.repository.EventRepository;
import com.geoguard.repository.RiskRepository;
import com.geoguard.repository.TelemetryRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class TelemetryService {
    private final RiskRepository riskRepository;
    private final TelemetryRepository telemetryRepository;
    private final EventRepository eventRepository;
    private final ApplicationEventPublisher eventPublisher;

    public TelemetryService(RiskRepository riskRepository, TelemetryRepository telemetryRepository,
                            EventRepository eventRepository, ApplicationEventPublisher eventPublisher) {
        this.riskRepository = riskRepository;
        this.telemetryRepository = telemetryRepository;
        this.eventRepository = eventRepository;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public TelemetryBatchResponse ingest(TelemetryBatchRequest request) {
        List<TelemetryView> accepted = new ArrayList<>(request.items().size());
        request.items().forEach(input -> {
            RiskAssessment risk = riskRepository.assess(input.longitude(), input.latitude(), input.altitude());
            long id = telemetryRepository.insert(input, risk);
            if (risk.status() != HazardStatus.SAFE) {
                eventRepository.insertFromTelemetry(id, risk);
            }
            accepted.add(telemetryRepository.findById(id));
        });
        eventPublisher.publishEvent(new TelemetryAcceptedEvent(accepted));
        return new TelemetryBatchResponse(accepted.size(), accepted);
    }

    @Transactional(readOnly = true)
    public PageResponse<TelemetryView> search(String droneId, BoundingBox bbox, Instant from, Instant to,
                                               HazardStatus status, Double zoneDistanceMeters,
                                               int page, int size) {
        validateTimeRange(from, to);
        if (zoneDistanceMeters != null && (zoneDistanceMeters < 0 || zoneDistanceMeters > 100_000)) {
            throw new BadRequestException("INVALID_DISTANCE", "zoneDistanceMeters는 0 이상 100000 이하이어야 합니다.");
        }
        long startedAt = System.nanoTime();
        PageResponse<TelemetryView> response = telemetryRepository.search(
                droneId, bbox, from, to, status, zoneDistanceMeters, page, size);
        double queryTimeMs = Math.round((System.nanoTime() - startedAt) / 1_000.0) / 1_000.0;
        return response.withSearchMetadata(new SearchMetadata(
                queryTimeMs,
                appliedFilters(droneId, bbox, from, to, status, zoneDistanceMeters),
                candidateIndexes(droneId, bbox, from, to, status)
        ));
    }

    private static List<String> appliedFilters(String droneId, BoundingBox bbox, Instant from, Instant to,
                                                HazardStatus status, Double zoneDistanceMeters) {
        List<String> filters = new ArrayList<>();
        if (droneId != null && !droneId.isBlank()) filters.add("DRONE_ID");
        if (from != null || to != null) filters.add("TIME_RANGE");
        if (bbox != null) filters.add("BBOX");
        if (status != null) filters.add("STATUS");
        if (zoneDistanceMeters != null) filters.add("ZONE_DISTANCE");
        return List.copyOf(filters);
    }

    private static List<String> candidateIndexes(String droneId, BoundingBox bbox, Instant from, Instant to,
                                                  HazardStatus status) {
        List<String> indexes = new ArrayList<>();
        boolean hasDrone = droneId != null && !droneId.isBlank();
        boolean hasTime = from != null || to != null;
        if (hasDrone) {
            indexes.add("idx_telemetry_drone_recorded_at");
        } else if (hasTime) {
            indexes.add("idx_telemetry_recorded_at");
        }
        if (bbox != null) indexes.add("idx_telemetry_position_gist");
        if (status == HazardStatus.DANGER && hasTime) indexes.add("idx_telemetry_danger_recorded_at");
        return List.copyOf(indexes);
    }

    @Transactional(readOnly = true)
    public TrackResponse track(String droneId, Instant from, Instant to, int limit) {
        validateTimeRange(from, to);
        List<TelemetryView> items = telemetryRepository.track(droneId, from, to, limit);
        return new TrackResponse(droneId, items.size(), items);
    }

    public static void validateTimeRange(Instant from, Instant to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new BadRequestException("INVALID_TIME_RANGE", "from은 to보다 늦을 수 없습니다.");
        }
    }
}
