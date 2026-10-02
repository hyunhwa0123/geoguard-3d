package com.geoguard;

import com.geoguard.domain.HazardStatus;
import com.geoguard.repository.RiskRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class SpatialApiIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGIS::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGIS::getUsername);
        registry.add("spring.datasource.password", POSTGIS::getPassword);
    }

    @Autowired
    RiskRepository riskRepository;

    @Autowired
    MockMvc mockMvc;

    @Test
    void classifiesInsideNearbyOutsideAndAltitude() {
        assertThat(riskRepository.assess(126.9724, 37.5545, 100).status()).isEqualTo(HazardStatus.DANGER);
        assertThat(riskRepository.assess(126.9760, 37.5545, 100).status()).isEqualTo(HazardStatus.WARNING);
        assertThat(riskRepository.assess(126.9800, 37.5545, 100).status()).isEqualTo(HazardStatus.SAFE);
        assertThat(riskRepository.assess(126.9724, 37.5545, 300).status()).isEqualTo(HazardStatus.SAFE);
    }

    @Test
    void storesBroadcastReadyTelemetryAndFindsItBySpaceTimeAndStatus() throws Exception {
        mockMvc.perform(post("/api/telemetry/batch")
                        .contentType("application/json")
                        .content("""
                                {"items":[{
                                  "droneId":"drone-it",
                                  "recordedAt":"2026-10-02T01:00:00Z",
                                  "longitude":126.9724,
                                  "latitude":37.5545,
                                  "altitude":100.0,
                                  "heading":90.0,
                                  "speed":12.5
                                }]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accepted").value(1))
                .andExpect(jsonPath("$.items[0].status").value("DANGER"));

        mockMvc.perform(get("/api/telemetry")
                        .param("droneId", "drone-it")
                        .param("bbox", "126.97,37.55,126.98,37.56")
                        .param("from", "2026-10-02T00:00:00Z")
                        .param("to", "2026-10-02T02:00:00Z")
                        .param("status", "DANGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.searchMetadata.queryTimeMs").isNumber())
                .andExpect(jsonPath("$.searchMetadata.appliedFilters").isArray())
                .andExpect(jsonPath("$.searchMetadata.candidateIndexes[0]").value("idx_telemetry_drone_recorded_at"))
                .andExpect(jsonPath("$.searchMetadata.candidateIndexes[1]").value("idx_telemetry_position_gist"))
                .andExpect(jsonPath("$.items[0].speed").value(12.5));

        mockMvc.perform(get("/api/events").param("status", "DANGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].zoneName").value("Seoul Station Safety Zone"));
    }

    @Test
    void returnsConsistentValidationErrors() throws Exception {
        mockMvc.perform(get("/api/telemetry").param("bbox", "127,38,126,37"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_BBOX"))
                .andExpect(jsonPath("$.path").value("/api/telemetry"));
    }
}
