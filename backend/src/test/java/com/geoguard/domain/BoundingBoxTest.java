package com.geoguard.domain;

import com.geoguard.error.BadRequestException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BoundingBoxTest {
    @Test
    void parsesFourCoordinates() {
        BoundingBox bbox = BoundingBox.parse("126.9,37.4,127.1,37.7");

        assertThat(bbox.minLongitude()).isEqualTo(126.9);
        assertThat(bbox.maxLatitude()).isEqualTo(37.7);
    }

    @Test
    void rejectsAnInvertedBox() {
        assertThatThrownBy(() -> BoundingBox.parse("127,38,126,37"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("최소값");
    }
}
