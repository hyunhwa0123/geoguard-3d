package com.geoguard.domain;

public enum HazardStatus {
    SAFE,
    WARNING,
    DANGER;

    public static HazardStatus worst(HazardStatus left, HazardStatus right) {
        return left.ordinal() >= right.ordinal() ? left : right;
    }
}
