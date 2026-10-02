package com.geoguard.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geoguard.repository.ZoneRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/zones")
@Tag(name = "Zones", description = "제한구역 GeoJSON")
public class ZoneController {
    private final ZoneRepository zoneRepository;
    private final ObjectMapper objectMapper;

    public ZoneController(ZoneRepository zoneRepository, ObjectMapper objectMapper) {
        this.zoneRepository = zoneRepository;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "위험구역 조회", description = "RFC 7946 GeoJSON FeatureCollection을 반환합니다.")
    public Map<String, Object> zones() {
        List<Map<String, Object>> features = zoneRepository.findAll().stream().map(zone -> {
            try {
                Map<String, Object> properties = new LinkedHashMap<>();
                properties.put("id", zone.id());
                properties.put("name", zone.name());
                properties.put("minAltitude", zone.minAltitude());
                properties.put("maxAltitude", zone.maxAltitude());
                properties.put("description", zone.description());
                Map<String, Object> feature = new LinkedHashMap<>();
                feature.put("type", "Feature");
                feature.put("id", zone.id());
                feature.put("geometry", objectMapper.readTree(zone.boundaryGeoJson()));
                feature.put("properties", properties);
                return feature;
            } catch (JsonProcessingException exception) {
                throw new IllegalStateException("PostGIS GeoJSON 응답을 파싱하지 못했습니다.", exception);
            }
        }).toList();
        return Map.of("type", "FeatureCollection", "features", features);
    }
}
