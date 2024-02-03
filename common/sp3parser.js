import fs from 'fs';
import {LocalDateTime, ZoneOffset} from "@js-joda/core";
import satellite from 'satellite.js';

// SP3 file parser
let constellationIds = {
    'G': 'GPS',     // US
    'R': 'GLONASS', // RU
    'E': 'GALILEO', // EU
    'C': 'BEIDOU',  // CN
    'J': 'QZSS',    // JP
    'I': 'IRNSS'    // IN
};

export function parseFile(path, observer = null, inECF = false) {
    try {
        const data = fs.readFileSync(path, 'utf8');

        // TODO parse header

        let satData = {};
        let timestamp = null;
        let time = null;
        data.split('\n').forEach((line) => {
            if (line[0] === '*') {
                // epoch
                // TODO we assume GPS time. read real time system from line 13 bytes 9-11
                let year = parseInt(line.substring(3, 7));
                let month = parseInt(line.substring(8, 10));
                let day = parseInt(line.substring(11, 13));
                let hour = parseInt(line.substring(14, 16));
                let minute = parseInt(line.substring(17, 19));
                let second = parseInt(line.substring(20, 22));

                let ldt = LocalDateTime.of(year, month, day, hour, minute, second);
                timestamp = ldt.toEpochSecond(ZoneOffset.UTC);
                time = satellite.gstime(year, month, day, hour, minute, second);
            }
            else if (line[0] === 'P') {
                // sat position data
                let constellationId = line[1];
                let constellationName = constellationIds[constellationId];
                let satId = parseInt(line.substring(2, 4));
                let x = parseFloat(line.substring(4, 18));
                let y = parseFloat(line.substring(18, 32));
                let z = parseFloat(line.substring(32, 46));

                if (! satData.hasOwnProperty(constellationId))
                    satData[constellationId] = {};
                if (! satData[constellationId].hasOwnProperty(satId))
                    satData[constellationId][satId] = {};

                satData[constellationId][satId][timestamp] = {};
                const eciCoords = satellite.ecfToEci({x: x, y: y, z: z}, time);
                satData[constellationId][satId][timestamp].pos = inECF  ? { x: x, y: y, z: z }
                                                                        : { x: eciCoords.x, y: eciCoords.y, z: eciCoords.z };

                if (observer !== null)
                {
                    satData[constellationId][satId][timestamp].lookAngles = satellite.ecfToLookAngles(observer, {x: x, y: y, z: z});
                }
            }
        })

        return satData;
    } catch (err) {
        console.error(err);
    }
    return null;
}


