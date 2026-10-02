package com.geoguard.api;

import com.geoguard.api.dto.EventView;
import com.geoguard.api.dto.PageResponse;
import com.geoguard.domain.HazardStatus;
import com.geoguard.service.EventService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api/events")
@Validated
@Tag(name = "Events", description = "WARNING/DANGER 위험 이벤트")
public class EventController {
    private final EventService eventService;

    public EventController(EventService eventService) {
        this.eventService = eventService;
    }

    @GetMapping
    @Operation(summary = "위험 이벤트 검색")
    public PageResponse<EventView> search(
            @RequestParam(required = false) HazardStatus status,
            @RequestParam(required = false) @Size(max = 64) String droneId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "100") @Min(1) @Max(1_000) int size) {
        return eventService.search(status, droneId, from, to, page, size);
    }
}
