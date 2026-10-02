package com.geoguard.repository;

import com.geoguard.domain.HazardStatus;
import com.geoguard.domain.RiskAssessment;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class RiskRepository {
    private static final String ASSESS_SQL = """
            WITH point AS (
                SELECT ST_SetSRID(ST_MakePoint(:longitude, :latitude, :altitude), 4326) AS geom
            )
            SELECT z.id, z.name,
                   CASE WHEN ST_Covers(z.boundary, point.geom) THEN 'DANGER' ELSE 'WARNING' END AS status,
                   ST_Distance(z.boundary::geography, point.geom::geography) AS distance_meters
              FROM restricted_zone z
              CROSS JOIN point
             WHERE :altitude BETWEEN z.min_altitude AND z.max_altitude
               AND ST_DWithin(z.boundary::geography, point.geom::geography, 200.0)
             ORDER BY CASE WHEN ST_Covers(z.boundary, point.geom) THEN 0 ELSE 1 END,
                      distance_meters ASC, z.id ASC
             LIMIT 1
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public RiskRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public RiskAssessment assess(double longitude, double latitude, double altitude) {
        var parameters = new MapSqlParameterSource()
                .addValue("longitude", longitude)
                .addValue("latitude", latitude)
                .addValue("altitude", altitude);
        List<RiskAssessment> matches = jdbc.query(ASSESS_SQL, parameters, (rs, rowNum) ->
                new RiskAssessment(
                        HazardStatus.valueOf(rs.getString("status")),
                        rs.getLong("id"),
                        rs.getString("name"),
                        rs.getDouble("distance_meters")));
        return matches.isEmpty() ? RiskAssessment.safe() : matches.getFirst();
    }
}
