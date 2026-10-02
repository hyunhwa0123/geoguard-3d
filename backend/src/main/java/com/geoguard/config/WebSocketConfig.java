package com.geoguard.config;

import com.geoguard.websocket.TelemetryWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final TelemetryWebSocketHandler handler;
    private final GeoGuardProperties properties;

    public WebSocketConfig(TelemetryWebSocketHandler handler, GeoGuardProperties properties) {
        this.handler = handler;
        this.properties = properties;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/telemetry")
                .setAllowedOriginPatterns(properties.cors().allowedOrigins().toArray(String[]::new));
    }
}
