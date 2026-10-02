package com.geoguard.api;

import com.geoguard.api.dto.RouteAnalysisRequest;
import com.geoguard.api.dto.RouteAnalysisResponse;
import com.geoguard.service.RouteAnalysisService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/routes")
@Tag(name = "Routes", description = "저장하지 않는 예정 경로 위험 분석")
public class RouteController {
    private final RouteAnalysisService routeAnalysisService;

    public RouteController(RouteAnalysisService routeAnalysisService) {
        this.routeAnalysisService = routeAnalysisService;
    }

    @PostMapping("/analyze")
    @Operation(summary = "경로 위험 분석", description = "각 지점의 고도와 제한구역 포함/200m 근접 여부를 분석합니다.")
    public RouteAnalysisResponse analyze(@Valid @RequestBody RouteAnalysisRequest request) {
        return routeAnalysisService.analyze(request);
    }
}
