package com.geoguard.service;

import com.geoguard.api.dto.AnalyzedRoutePoint;
import com.geoguard.api.dto.RouteAnalysisRequest;
import com.geoguard.api.dto.RouteAnalysisResponse;
import com.geoguard.domain.HazardStatus;
import com.geoguard.domain.RiskAssessment;
import com.geoguard.repository.RiskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.EnumMap;

@Service
public class RouteAnalysisService {
    private final RiskRepository riskRepository;

    public RouteAnalysisService(RiskRepository riskRepository) {
        this.riskRepository = riskRepository;
    }

    @Transactional(readOnly = true)
    public RouteAnalysisResponse analyze(RouteAnalysisRequest request) {
        var counts = new EnumMap<HazardStatus, Long>(HazardStatus.class);
        for (HazardStatus status : HazardStatus.values()) {
            counts.put(status, 0L);
        }
        HazardStatus worst = HazardStatus.SAFE;
        var analyzed = new ArrayList<AnalyzedRoutePoint>(request.points().size());
        for (int index = 0; index < request.points().size(); index++) {
            var point = request.points().get(index);
            RiskAssessment risk = riskRepository.assess(point.longitude(), point.latitude(), point.altitude());
            counts.compute(risk.status(), (status, count) -> count + 1);
            worst = HazardStatus.worst(worst, risk.status());
            analyzed.add(new AnalyzedRoutePoint(index, point.recordedAt(), point.longitude(), point.latitude(),
                    point.altitude(), risk.status(), risk.zoneId(), risk.zoneName(), risk.distanceMeters()));
        }
        return new RouteAnalysisResponse(request.droneId(), worst, counts, analyzed);
    }
}
