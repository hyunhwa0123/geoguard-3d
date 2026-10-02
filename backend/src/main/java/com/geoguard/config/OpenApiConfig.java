package com.geoguard.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {
    @Bean
    OpenAPI geoGuardOpenApi() {
        return new OpenAPI().info(new Info()
                .title("GeoGuard 3D API")
                .version("v1")
                .description("드론 텔레메트리 수집, PostGIS 공간 검색 및 위험구역 분석 API"));
    }
}
