export function isAngleBetween(a, x1, x2) {
    if (x1 < x2)
        return x1 < a && a < x2;
    else
        return x1 < a || a < x2;
}

const RAD2DEG = 180.0 / Math.PI;
const DEG2RAD = 1.0 / RAD2DEG;

export function rad2deg(rad) {
    return rad * RAD2DEG;
}

export function deg2rad(deg) {
    return deg * DEG2RAD;
}

export function eci2three(pos, asArray = true) {
    if (asArray)
        return [pos.y, pos.z, pos.x];
    else
        return { x: pos.y, y: pos.z, z: pos.x };
}

const constellationColors = {
    'G': 0x00ff00, // US
    'R': 0xff0000, // RU
    'E': 0x3282F6, // EU
    'C': 0x00ffff, // CN
    'J': 0xffffff, // JP
    'I': 0xff7f27, // IN
};

export function getColorOfConstellation(constellationId) {
    return constellationColors[constellationId];
}

export function getColorStrOfConstellation(constellationId) {
    return '#' + getColorOfConstellation(constellationId).toString(16).padStart(6, '0');
}