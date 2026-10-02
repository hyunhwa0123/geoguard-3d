package com.geoguard.service;

import com.geoguard.api.dto.RouteAnalysisRequest;
import com.geoguard.api.dto.RoutePoint;
import com.geoguard.domain.HazardStatus;
import com.geoguard.domain.RiskAssessment;
import com.geoguard.repository.RiskRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RouteAnalysisServiceTest {
    @Test
    void returnsWorstStatusAndCounts() {
        RiskRepository repository = mock(RiskRepository.class);
        when(repository.assess(126.9, 37.5, 100)).thenReturn(RiskAssessment.safe());
        when(repository.assess(127.0, 37.6, 100))
                .thenReturn(new RiskAssessment(HazardStatus.DANGER, 1L, "zone", 0));
        var service = new RouteAnalysisService(repository);

        var response = service.analyze(new RouteAnalysisRequest("drone-1", List.of(
                new RoutePoint(null, 126.9, 37.5, 100.0),
                new RoutePoint(null, 127.0, 37.6, 100.0))));

        assertThat(response.worstStatus()).isEqualTo(HazardStatus.DANGER);
        assertThat(response.statusCounts()).containsEntry(HazardStatus.SAFE, 1L)
                .containsEntry(HazardStatus.DANGER, 1L);
    }
}
