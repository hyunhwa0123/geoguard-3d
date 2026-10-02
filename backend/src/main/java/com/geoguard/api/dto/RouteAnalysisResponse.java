package com.geoguard.api.dto;

import com.geoguard.domain.HazardStatus;

import java.util.List;
import java.util.Map;

public record RouteAnalysisResponse(
        String droneId,
        HazardStatus worstStatus,
        Map<HazardStatus, Long> statusCounts,
        List<AnalyzedRoutePoint> points
) {
}
