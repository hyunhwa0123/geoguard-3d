package com.geoguard.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "geoguard")
public record GeoGuardProperties(Cors cors) {
    public GeoGuardProperties {
        cors = cors == null ? new Cors(List.of("http://localhost:5173")) : cors;
    }

    public record Cors(List<String> allowedOrigins) {
        public Cors {
            allowedOrigins = allowedOrigins == null || allowedOrigins.isEmpty()
                    ? List.of("http://localhost:5173") : List.copyOf(allowedOrigins);
        }
    }
}
