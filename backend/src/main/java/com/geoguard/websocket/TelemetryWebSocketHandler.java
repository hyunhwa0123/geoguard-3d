package com.geoguard.websocket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geoguard.service.TelemetryAcceptedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TelemetryWebSocketHandler extends TextWebSocketHandler {
    private static final Logger log = LoggerFactory.getLogger(TelemetryWebSocketHandler.class);
    private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();
    private final ObjectMapper objectMapper;

    public TelemetryWebSocketHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.add(session);
        send(session, objectMapper.writeValueAsString(Map.of("type", "connected", "timestamp", Instant.now())));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        sessions.remove(session);
        if (session.isOpen()) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTelemetryAccepted(TelemetryAcceptedEvent event) {
        event.items().forEach(item -> {
            try {
                broadcast(objectMapper.writeValueAsString(Map.of("type", "telemetry", "data", item)));
            } catch (JsonProcessingException exception) {
                log.error("WebSocket 텔레메트리 직렬화 실패", exception);
            }
        });
    }

    private void broadcast(String payload) {
        sessions.forEach(session -> {
            if (!session.isOpen()) {
                sessions.remove(session);
                return;
            }
            try {
                send(session, payload);
            } catch (IOException exception) {
                sessions.remove(session);
                log.debug("WebSocket 전송 실패: {}", session.getId(), exception);
            }
        });
    }

    private void send(WebSocketSession session, String payload) throws IOException {
        synchronized (session) {
            session.sendMessage(new TextMessage(payload));
        }
    }
}
