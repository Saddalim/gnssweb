import {fileURLToPath} from "url";
import path from "path";
import fs from "fs-extra";
import satellite from "satellite.js";

const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.normalize(path.dirname(__filename) + path.sep + "..");

export const config = JSON.parse(fs.readFileSync(__dirname + "/settings.json"));
console.log("Config:", config);

// Obs stations
export const stations = {
    // Krudy
    0: {
        id: 0,
        latitude: satellite.degreesToRadians(47.48989520653702),
        longitude: satellite.degreesToRadians(19.06749666602772),
        height: 113.0 / 1000.0, // [km]
        azimuthLimits: {min: satellite.degreesToRadians(270), max: satellite.degreesToRadians(320)},
        elevationLimits: {min: satellite.degreesToRadians(50), max: satellite.degreesToRadians(70)},
        descendingOnly: false,
        minSatCntInWindow: 3,
        minCommonWindowLength: 600
    },

    // Kenese
    1: {
        id: 1,
        latitude: satellite.degreesToRadians(47.029834),
        longitude: satellite.degreesToRadians(18.110587),
        height: 108.0 / 1000.0, // [km]
        azimuthLimits: {min: satellite.degreesToRadians(110), max: satellite.degreesToRadians(220)},
        elevationLimits: {min: satellite.degreesToRadians(0), max: satellite.degreesToRadians(25)},
        descendingOnly: true,
        minSatCntInWindow: 4,
        minCommonWindowLength: 600
    },

    // Keszthely
    2: {
        id: 2,
        latitude: satellite.degreesToRadians(46.76284308230114),
        longitude: satellite.degreesToRadians(17.264326770782656),
        height: 108.0 / 1000.0, // [km]
        azimuthLimits: {min: satellite.degreesToRadians(100), max: satellite.degreesToRadians(150)},
        elevationLimits: {min: satellite.degreesToRadians(0), max: satellite.degreesToRadians(25)},
        descendingOnly: false,
        minSatCntInWindow: 1,
        minCommonWindowLength: 300,
        constellations: ["G"]
    },

    // DOVH
    3: {
        id: 3,
        latitude: satellite.degreesToRadians(47.468432),
        longitude: satellite.degreesToRadians(19.067489),
        height: 120.0 / 1000.0, // [km]
        azimuthLimits: {min: satellite.degreesToRadians(160), max: satellite.degreesToRadians(220)},
        elevationLimits: {min: satellite.degreesToRadians(0), max: satellite.degreesToRadians(25)},
        descendingOnly: true,
        minSatCntInWindow: 1,
        minCommonWindowLength: 600
    }
};
