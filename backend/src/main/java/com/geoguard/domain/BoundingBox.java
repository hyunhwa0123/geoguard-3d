package com.geoguard.domain;

import com.geoguard.error.BadRequestException;

public record BoundingBox(double minLongitude, double minLatitude,
                          double maxLongitude, double maxLatitude) {
    public BoundingBox {
        if (minLongitude < -180 || maxLongitude > 180 || minLatitude < -90 || maxLatitude > 90) {
            throw new BadRequestException("INVALID_BBOX", "bbox 좌표가 유효한 경위도 범위를 벗어났습니다.");
        }
        if (minLongitude >= maxLongitude || minLatitude >= maxLatitude) {
            throw new BadRequestException("INVALID_BBOX", "bbox는 minLon,minLat,maxLon,maxLat 순서이며 최소값이 최대값보다 작아야 합니다.");
        }
    }

    public static BoundingBox parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String[] coordinates = value.split(",");
        if (coordinates.length != 4) {
            throw new BadRequestException("INVALID_BBOX", "bbox는 minLon,minLat,maxLon,maxLat 형식이어야 합니다.");
        }
        try {
            return new BoundingBox(
                    Double.parseDouble(coordinates[0].trim()),
                    Double.parseDouble(coordinates[1].trim()),
                    Double.parseDouble(coordinates[2].trim()),
                    Double.parseDouble(coordinates[3].trim()));
        } catch (NumberFormatException exception) {
            throw new BadRequestException("INVALID_BBOX", "bbox에는 숫자 네 개가 필요합니다.");
        }
    }
}
