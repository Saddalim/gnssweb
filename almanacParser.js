import fs from 'fs';
import * as GNSS from "./public/gnss.js";
import {convert, LocalDateTime, ZoneOffset} from "@js-joda/core";
import satellite from 'satellite.js';

const dt = 5 * 60; // 5 min // [s] Time between two calculated positions of an orbit
const predictionLength = 5 * 24 * 60 * 60; // 5 days // [s] Length of predicted time

// Map of NORAD IDs to constellation / sat IDs
let satelliteIds = {
    // TODO
}

export function parseFile(path) {

    // TODO actually read a file. This is a sample almanac entry for GALILEO's #1 sat (E01)

    {
        const data = fs.readFileSync(path, 'utf8');

        let satData = {};

        let tleLine1 = null;
        let tleLine2 = null;

        data.split('\n').forEach((line) => {
            if (tleLine1 === null) {
                tleLine1 = line;
            }
            else if (tleLine2 === null) {
                tleLine2 = line;

                let satRec = satellite.twoline2satrec(tleLine1, tleLine2);
                if (! satelliteIds.hasOwnProperty(satRec.satnum))
                {
                    console.log("Unknown GNSS SAT: " + satRec.satnum);
                    return;
                }

                const constellationId = satelliteIds[satRec.satnum].constellationId;
                const satId = satelliteIds[satRec.satnum].satId;

                if (! satData.hasOwnProperty(constellationId))
                    satData[constellationId] = {};
                if (! satData[constellationId].hasOwnProperty(satId))
                    satData[constellationId][satId] = {};

                const startEpoch = LocalDateTime.of(2000 + satRec.epochyr, 1, 1).plusDays(Math.floor(satRec.epochdays)).plusSeconds(Math.round(satRec.epochdays % 1 * 86400));

                for (let t = 0; t < predictionLength; t += dt)
                {
                    const epoch = startEpoch.plusSeconds(t);
                    const posAndVel = satellite.sgp4(satRec, t / 60);
                    // alternate propagation, but seems to work quite badly
                    /*
                    let nativeDate = convert(epoch, ZoneOffset.UTC).toDate();
                    nativeDate.setHours(nativeDate.getHours() + 2);
                    const pv = satellite.propagate(satRec, nativeDate);
                     */
                    satData[constellationId][satId][epoch] = { x: posAndVel.position.x * 1000.0, y: posAndVel.position.y * 1000.0, z: posAndVel.position.z * 1000.0 };
                }

                tleLine1 = null;
                tleLine2 = null;
            }
        });

        return satData;
    }

    {
        // Parse XML from Galileo (GSC Europa) almanac (https://www.gsc-europa.eu/gsc-products/almanac#parameters)
        // !!! These calculations result in the ECI frame being rotated by 90° relative to the TLE-based calculations !!!
        const constellationId = 'E';
        const satId = 1;
        let startEpoch = LocalDateTime.of(2023, 4, 20, 0, 0, 0);
        let aSqRoot = 0.033203125;                           // [m^1/2] Difference with respect to the square root of the nominal semi-major axis (29 600 km)
        let ecc = 0.000152587890625;                         // [1] Eccentricity
        let deltaI = -0.00231933593750006505213034913027;    // [pi rad] Inclination at reference time relative to i0 = 56º
        let omega0 = 0.275939941406258604228440844963;       // [pi rad] Right ascension
        let omegaDot = -1.86264514923107200935514487085e-09; // [pi rad / s] Rate of right ascension
        let w = 0.297363281250014155343563970746;            // [pi rad] Argument of perigee
        let m0 = -0.822784423828268884903991420288;          // [pi rad] Satellite mean anomaly at reference time

        let sma = (Math.sqrt(29600000) - aSqRoot)**2;

        let satData = {};
        satData[constellationId] = {};
        satData[constellationId][satId] = {};
        const orbitPts = [];
        for (let t = 0; t < predictionLength; t += dt)
        {
            const epoch = startEpoch.plusSeconds(t);
            const [pos, vel] = GNSS.KOE2ECI(
                sma,
                ecc,
                GNSS.deg2rad(56) + deltaI,
                GNSS.semiCirclesToRad(m0),
                GNSS.semiCirclesToRad(w),
                GNSS.semiCirclesToRad(omega0),
                t
            );
            //orbitPts.push( new THREE.Vector3(pos[0], pos[1], pos[2]));
            satData[constellationId][satId][epoch] = { x: pos[0], y: pos[1], z: pos[2] };
        }

        return satData;

    }

}