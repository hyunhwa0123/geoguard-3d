package com.geoguard;

import com.geoguard.config.GeoGuardProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(GeoGuardProperties.class)
public class GeoGuardApplication {
    public static void main(String[] args) {
        SpringApplication.run(GeoGuardApplication.class, args);
    }
}
