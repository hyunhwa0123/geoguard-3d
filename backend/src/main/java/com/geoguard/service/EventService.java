package com.geoguard.service;

import com.geoguard.api.dto.EventView;
import com.geoguard.api.dto.PageResponse;
import com.geoguard.domain.HazardStatus;
import com.geoguard.error.BadRequestException;
import com.geoguard.repository.EventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class EventService {
    private final EventRepository eventRepository;

    public EventService(EventRepository eventRepository) {
        this.eventRepository = eventRepository;
    }

    @Transactional(readOnly = true)
    public PageResponse<EventView> search(HazardStatus status, String droneId, Instant from, Instant to,
                                          int page, int size) {
        TelemetryService.validateTimeRange(from, to);
        if (status == HazardStatus.SAFE) {
            throw new BadRequestException("INVALID_EVENT_STATUS", "이벤트 상태는 WARNING 또는 DANGER만 허용됩니다.");
        }
        return eventRepository.search(status, droneId, from, to, page, size);
    }
}
