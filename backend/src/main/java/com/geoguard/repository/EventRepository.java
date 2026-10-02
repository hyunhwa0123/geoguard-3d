package com.geoguard.repository;

import com.geoguard.api.dto.EventView;
import com.geoguard.api.dto.PageResponse;
import com.geoguard.domain.HazardStatus;
import com.geoguard.domain.RiskAssessment;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Repository
public class EventRepository {
    private static final RowMapper<EventView> ROW_MAPPER = (rs, rowNum) -> new EventView(
            rs.getLong("id"),
            rs.getLong("telemetry_id"),
            rs.getString("drone_id"),
            rs.getTimestamp("recorded_at").toInstant(),
            HazardStatus.valueOf(rs.getString("status")),
            rs.getLong("zone_id"),
            rs.getString("zone_name"),
            rs.getDouble("distance_meters"),
            rs.getDouble("longitude"),
            rs.getDouble("latitude"),
            rs.getDouble("altitude"));

    private final NamedParameterJdbcTemplate jdbc;

    public EventRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insertFromTelemetry(long telemetryId, RiskAssessment risk) {
        jdbc.update("""
                INSERT INTO risk_event
                    (telemetry_id, zone_id, drone_id, status, distance_meters, occurred_at)
                SELECT id, :zoneId, drone_id, status, :distanceMeters, recorded_at
                  FROM telemetry
                 WHERE id = :telemetryId AND status IN ('WARNING', 'DANGER')
                """, new MapSqlParameterSource("telemetryId", telemetryId)
                .addValue("zoneId", risk.zoneId())
                .addValue("distanceMeters", risk.distanceMeters()));
    }

    public PageResponse<EventView> search(HazardStatus status, String droneId, Instant from, Instant to,
                                          int page, int size) {
        List<String> clauses = new ArrayList<>();
        var parameters = new MapSqlParameterSource();
        if (status != null) {
            clauses.add("e.status = :status");
            parameters.addValue("status", status.name());
        }
        if (droneId != null && !droneId.isBlank()) {
            clauses.add("e.drone_id = :droneId");
            parameters.addValue("droneId", droneId);
        }
        if (from != null) {
            clauses.add("e.occurred_at >= :from");
            parameters.addValue("from", Timestamp.from(from));
        }
        if (to != null) {
            clauses.add("e.occurred_at <= :to");
            parameters.addValue("to", Timestamp.from(to));
        }
        String where = clauses.isEmpty() ? "" : " WHERE " + String.join(" AND ", clauses);
        long total = jdbc.queryForObject("SELECT count(*) FROM risk_event e" + where, parameters, Long.class);
        parameters.addValue("limit", size).addValue("offset", (long) page * size);
        List<EventView> items = jdbc.query("""
                        SELECT e.id, e.telemetry_id, e.drone_id, e.occurred_at AS recorded_at, e.status,
                               e.zone_id, z.name AS zone_name, e.distance_meters,
                               ST_X(t.position) AS longitude, ST_Y(t.position) AS latitude,
                               t.altitude
                          FROM risk_event e
                          JOIN telemetry t ON t.id = e.telemetry_id
                          LEFT JOIN restricted_zone z ON z.id = e.zone_id
                        """ + where + " ORDER BY e.occurred_at DESC, e.id DESC LIMIT :limit OFFSET :offset",
                parameters, ROW_MAPPER);
        return PageResponse.of(items, page, size, total);
    }
}
