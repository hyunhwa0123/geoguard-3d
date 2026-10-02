package com.geoguard.repository;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class ZoneRepository {
    private final JdbcClient jdbc;

    public ZoneRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<ZoneRecord> findAll() {
        return jdbc.sql("""
                        SELECT id, name, ST_AsGeoJSON(boundary) AS boundary_geojson,
                               min_altitude, max_altitude, description
                          FROM restricted_zone
                         ORDER BY id
                        """)
                .query((rs, rowNum) -> new ZoneRecord(
                        rs.getLong("id"),
                        rs.getString("name"),
                        rs.getString("boundary_geojson"),
                        rs.getDouble("min_altitude"),
                        rs.getDouble("max_altitude"),
                        rs.getString("description")))
                .list();
    }
}
