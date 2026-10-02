package com.geoguard.repository;

import com.geoguard.api.dto.PageResponse;
import com.geoguard.api.dto.TelemetryInput;
import com.geoguard.api.dto.TelemetryView;
import com.geoguard.domain.BoundingBox;
import com.geoguard.domain.HazardStatus;
import com.geoguard.domain.RiskAssessment;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Repository
public class TelemetryRepository {
    private static final String VIEW_COLUMNS = """
            t.id, t.drone_id, t.recorded_at,
            ST_X(t.position) AS longitude, ST_Y(t.position) AS latitude,
            t.altitude, t.heading, t.speed, t.status, e.zone_id AS nearest_zone_id,
            z.name AS nearest_zone_name, e.distance_meters
            """;

    private static final RowMapper<TelemetryView> ROW_MAPPER = (rs, rowNum) -> {
        double distance = rs.getDouble("distance_meters");
        Double nullableDistance = rs.wasNull() ? null : distance;
        long zoneId = rs.getLong("nearest_zone_id");
        Long nullableZoneId = rs.wasNull() ? null : zoneId;
        double heading = rs.getDouble("heading");
        Double nullableHeading = rs.wasNull() ? null : heading;
        double speed = rs.getDouble("speed");
        Double nullableSpeed = rs.wasNull() ? null : speed;
        return new TelemetryView(
                rs.getLong("id"),
                rs.getString("drone_id"),
                rs.getTimestamp("recorded_at").toInstant(),
                rs.getDouble("longitude"),
                rs.getDouble("latitude"),
                rs.getDouble("altitude"),
                nullableHeading,
                nullableSpeed,
                HazardStatus.valueOf(rs.getString("status")),
                nullableZoneId,
                rs.getString("nearest_zone_name"),
                nullableDistance);
    };

    private final NamedParameterJdbcTemplate jdbc;

    public TelemetryRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long insert(TelemetryInput input, RiskAssessment risk) {
        String sql = """
                INSERT INTO telemetry
                    (drone_id, recorded_at, position, altitude, heading, speed, status)
                VALUES
                    (:droneId, :recordedAt,
                     ST_SetSRID(ST_MakePoint(:longitude, :latitude, :altitude), 4326),
                     :altitude, :heading, :speed, :status)
                """;
        var parameters = new MapSqlParameterSource()
                .addValue("droneId", input.droneId())
                .addValue("recordedAt", Timestamp.from(input.recordedAt()))
                .addValue("longitude", input.longitude())
                .addValue("latitude", input.latitude())
                .addValue("altitude", input.altitude())
                .addValue("heading", input.heading())
                .addValue("speed", input.speed())
                .addValue("status", risk.status().name());
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(sql, parameters, keyHolder, new String[]{"id"});
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("텔레메트리 저장 후 ID를 가져오지 못했습니다.");
        }
        return key.longValue();
    }

    public TelemetryView findById(long id) {
        String sql = "SELECT " + VIEW_COLUMNS
                + " FROM telemetry t LEFT JOIN risk_event e ON e.telemetry_id = t.id"
                + " LEFT JOIN restricted_zone z ON z.id = e.zone_id WHERE t.id = :id";
        return jdbc.queryForObject(sql, new MapSqlParameterSource("id", id), ROW_MAPPER);
    }

    public PageResponse<TelemetryView> search(String droneId, BoundingBox bbox, Instant from, Instant to,
                                               HazardStatus status, Double zoneDistanceMeters,
                                               int page, int size) {
        QueryParts parts = filters(droneId, bbox, from, to, status, zoneDistanceMeters);
        long total = jdbc.queryForObject(
                "SELECT count(*) FROM telemetry t " + parts.where(), parts.parameters(), Long.class);
        parts.parameters().addValue("limit", size).addValue("offset", (long) page * size);
        String sql = "SELECT " + VIEW_COLUMNS
                + " FROM telemetry t LEFT JOIN risk_event e ON e.telemetry_id = t.id"
                + " LEFT JOIN restricted_zone z ON z.id = e.zone_id "
                + parts.where() + " ORDER BY t.recorded_at DESC, t.id DESC LIMIT :limit OFFSET :offset";
        List<TelemetryView> items = jdbc.query(sql, parts.parameters(), ROW_MAPPER);
        return PageResponse.of(items, page, size, total);
    }

    public List<TelemetryView> track(String droneId, Instant from, Instant to, int limit) {
        var parameters = new MapSqlParameterSource("droneId", droneId).addValue("limit", limit);
        StringBuilder where = new StringBuilder(" WHERE t.drone_id = :droneId");
        if (from != null) {
            where.append(" AND t.recorded_at >= :from");
            parameters.addValue("from", Timestamp.from(from));
        }
        if (to != null) {
            where.append(" AND t.recorded_at <= :to");
            parameters.addValue("to", Timestamp.from(to));
        }
        String sql = "SELECT " + VIEW_COLUMNS
                + " FROM telemetry t LEFT JOIN risk_event e ON e.telemetry_id = t.id"
                + " LEFT JOIN restricted_zone z ON z.id = e.zone_id "
                + where + " ORDER BY t.recorded_at ASC, t.id ASC LIMIT :limit";
        return jdbc.query(sql, parameters, ROW_MAPPER);
    }

    private QueryParts filters(String droneId, BoundingBox bbox, Instant from, Instant to,
                               HazardStatus status, Double zoneDistanceMeters) {
        List<String> clauses = new ArrayList<>();
        var parameters = new MapSqlParameterSource();
        if (droneId != null && !droneId.isBlank()) {
            clauses.add("t.drone_id = :droneId");
            parameters.addValue("droneId", droneId);
        }
        if (bbox != null) {
            clauses.add("t.position && ST_MakeEnvelope(:minLon, :minLat, :maxLon, :maxLat, 4326)");
            parameters.addValue("minLon", bbox.minLongitude())
                    .addValue("minLat", bbox.minLatitude())
                    .addValue("maxLon", bbox.maxLongitude())
                    .addValue("maxLat", bbox.maxLatitude());
        }
        if (from != null) {
            clauses.add("t.recorded_at >= :from");
            parameters.addValue("from", Timestamp.from(from));
        }
        if (to != null) {
            clauses.add("t.recorded_at <= :to");
            parameters.addValue("to", Timestamp.from(to));
        }
        if (status != null) {
            clauses.add("t.status = :status");
            parameters.addValue("status", status.name());
        }
        if (zoneDistanceMeters != null) {
            clauses.add("""
                    EXISTS (
                        SELECT 1 FROM restricted_zone dz
                         WHERE t.altitude BETWEEN dz.min_altitude AND dz.max_altitude
                           AND ST_DWithin(dz.boundary::geography, t.position::geography, :zoneDistanceMeters)
                    )
                    """);
            parameters.addValue("zoneDistanceMeters", zoneDistanceMeters);
        }
        return new QueryParts(clauses.isEmpty() ? "" : " WHERE " + String.join(" AND ", clauses), parameters);
    }

    private record QueryParts(String where, MapSqlParameterSource parameters) {
    }
}
