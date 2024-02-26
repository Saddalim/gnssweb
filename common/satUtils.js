import {LocalDateTime, ZoneOffset} from "@js-joda/core";
import fs from "fs-extra";
import http from 'http';
import zlib from 'zlib';
import * as common from './common.js';
import * as sp3parser from './sp3parser.js';
import satellite from "satellite.js";
import * as utils from "../public/utils.js";
import Immutable from "immutable";
import path from 'path';

let dataCache = {};

/**
 * Linear interpolation
 * TODO shall be in mathUtils
 * @param x
 * @param y
 * @param a
 * @returns {number}
 */
function lerp(x, y, a)
{
    return x * (1 - a) + y * a;
}

function lerpAll(x, y, a)
{
    return Object.fromEntries(Object.entries(x).map(e => [e[0], lerp(e[1], y[e[0]], a)]));
}

async function downloadDataFile(year, dayOfYear)
{
    return new Promise((resolve, reject) => {

        const fileName = `COD0OPSFIN_${year}${dayOfYear.toString().padStart(3, '0')}0000_01D_05M_ORB.SP3`;
        const url = `http://ftp.aiub.unibe.ch/CODE/${year}/` + fileName + '.gz';
        const destinationFile = path.join(common.config.gnssFilesPath, fileName);
        let success = false;

        let file = fs.createWriteStream(destinationFile);
        let request = http.get(url, function(response) {
            const gunzip = zlib.createGunzip();

            response.pipe(gunzip);
            gunzip.pipe(file);
            file.on('finish', function () {
                resolve();
            });
            gunzip
                .on("end", function() {
                    file.close();

                }).on("error", function(e) {
                    fs.unlink(destinationFile); // async delete
                    reject("Sat data file not available");
            });
        }).on('error', function(err) {
            fs.unlink(destinationFile); // async delete
            console.error(err.message);
            reject("Could not connect to sat database");
        });
        request.end();

    });
}

async function readDailyData(year, dayOfYear)
{
    const fileName = `COD0OPSFIN_${year}${dayOfYear.toString().padStart(3, '0')}0000_01D_05M_ORB.SP3`;
    const filePath = path.join(common.config.gnssFilesPath, fileName);

    if (! fs.existsSync(filePath))
    {
        await downloadDataFile(year, dayOfYear);
    }

    return sp3parser.parseFile(filePath, null, true);
}

export async function getCoordsOfSat(constellationId, satId, time)
{
    if (! (time instanceof LocalDateTime))
    {
        time = LocalDateTime.ofEpochSecond(time, ZoneOffset.UTC);
    }

    let year = time.year();
    let dayOfYear = time.dayOfYear();

    if (! dataCache.hasOwnProperty(year))
        dataCache[year] = {};

    if (! dataCache[year].hasOwnProperty(dayOfYear))
    {
        dataCache[year][dayOfYear] = await readDailyData(year, dayOfYear);
    }

    const epochToLookFor = time.toEpochSecond(ZoneOffset.ofHours(0));
    const timesAsArray = Object.entries(dataCache[year][dayOfYear][constellationId][satId]);
    const epochIdx1 = timesAsArray.findIndex(entry => entry[0] >= epochToLookFor);
    if (epochIdx1 === -1)
    {
        throw new Error("Sat position interpolation is not implemented for segments overlapping midnight after");
        // TODO
    }
    const epochAfter = parseInt(timesAsArray[epochIdx1][0]);
    if (epochAfter === epochToLookFor)
    {
        // exact epoch match, return exact solution
        return timesAsArray[epochIdx1][1];
    }
    else
    {
        // interpolate
        if (epochIdx1 === 0)
        {
            throw new Error("Sat position interpolation is not implemented for segments overlapping midnight before");
            // TODO
        }
        const epochIdx0 = epochIdx1 - 1;
        const epochBefore = parseInt(timesAsArray[epochIdx0][0]);
        const a = (epochToLookFor - epochBefore) / (epochAfter - epochBefore);
        const interpPos = lerpAll(timesAsArray[epochIdx0][1].pos, timesAsArray[epochIdx1][1].pos, a);
        return {
            pos: interpPos
        };
    }
}

export async function getLookAnglesOfSat(constellationId, satId, time, observer)
{
    const satCoords = await getCoordsOfSat(constellationId, satId, time);
    return satellite.ecfToLookAngles(observer, satCoords.pos);
}

export function collectObservationWindows(observer)
{
    // TODO parse when new file is available and cache
    const rawData = sp3parser.parseFile(common.config.gnssFilesPath + '/COD.EPH_5D', observer);

    let obsWindows = [];
    let windowsByEpoch = {};

    // dummy windows for testing - month goes from 0!!
    /*
    obsWindows.push({
        fromEpoch: Date.UTC(2023, 11, 14, 1, 22, 0, 0) / 1000,
        toEpoch: Date.UTC(2023, 11, 14, 1, 23, 0, 0) / 1000,
        satIds: ["E13", "G2", "B29"]
    });
     */


    for (const [constellationId, satellites] of Object.entries(rawData))
    {
        if (observer.hasOwnProperty('constellations') && ! observer.constellations.includes(constellationId))
            continue;

        for (const [satId, epochs] of Object.entries(satellites))
        {
            let ascending = null;
            let prevElevation = null;
            for (const [epoch, epochData] of Object.entries(epochs))
            {
                if (prevElevation != null)
                {
                    ascending = prevElevation < epochData.lookAngles.elevation;
                }
                prevElevation = epochData.lookAngles.elevation;

                if (observer.descendingOnly && ascending) continue;

                let epochNum = parseInt(epoch);
                const isInWindow = utils.isAngleBetween(epochData.lookAngles.azimuth, observer.azimuthLimits.min, observer.azimuthLimits.max)
                    && utils.isAngleBetween(epochData.lookAngles.elevation, observer.elevationLimits.min, observer.elevationLimits.max);

                if (!isInWindow) continue;

                if (!windowsByEpoch.hasOwnProperty(epochNum))
                    windowsByEpoch[epochNum] = [];

                windowsByEpoch[epochNum].push({constellation: constellationId, sat: satId});
            }
        }
    }

    // idea is to find time points where there are at least the given number of sats are in window at the same time
    // then define [begin, end] of observation window as the window when THESE are visible
    const epochData = Object.entries(windowsByEpoch);
    for (let epochIdx = 0; epochIdx < epochData.length; ++epochIdx)
    {
        const [candidateEpoch, candidateObsData] = epochData[epochIdx];
        if (candidateObsData.length < observer.minSatCntInWindow) continue;

        let candidateSatIds = Immutable.Set(candidateObsData.map((data) => data.constellation + data.sat));

        let epochFromIdx = epochIdx;
        let commonTimeWindowStart = parseInt(epochData[epochFromIdx][0]);
        for (; epochFromIdx >= 0; --epochFromIdx)
        {
            const [fromEpoch, fromEpochObsData] = epochData[epochFromIdx];
            const epochSatIds = Immutable.Set(fromEpochObsData.map((data) => data.constellation + data.sat));
            if (epochSatIds.size >= observer.minSatCntInWindow)
            {
                commonTimeWindowStart = parseInt(epochData[epochFromIdx][0]);
            }

            let stillInWindow = epochSatIds.intersect(candidateSatIds).size > 0;
            if (!stillInWindow)
            {
                ++epochFromIdx;
                break;
            }
        }
        if (epochFromIdx < 0) epochFromIdx = 0;

        let commonTimeWindowEnd = parseInt(epochData[epochIdx][0]);

        for (; epochIdx < epochData.length; ++epochIdx)
        {
            const [toEpoch, toEpochObsData] = epochData[epochIdx];
            const epochSatIds = Immutable.Set(toEpochObsData.map((data) => data.constellation + data.sat));
            if (epochSatIds.size >= observer.minSatCntInWindow)
            {
                commonTimeWindowEnd = parseInt(epochData[epochIdx][0]);
            }
            else if (commonTimeWindowEnd - commonTimeWindowStart < observer.minCommonWindowLength)
            {
                break;
            }

            // there are good windows that overlap - in this case, include the sats of the second sweetspot
            // so that the full window of those is included
            /*
            if (epochSatIds.length >= observer.minSatCntInWindow)
            {
                candidateSatIds = candidateSatIds.union(epochSatIds);
            }

             */

            let stillInWindow = epochSatIds.intersect(candidateSatIds).size > 0;
            if (!stillInWindow)
            {
                --epochIdx;
                break;
            }
        }
        if (epochIdx > epochData.length - 1) epochIdx = epochData.length - 1;
        if (commonTimeWindowEnd - commonTimeWindowStart >= observer.minCommonWindowLength)
        {
            // Window!
            let obsData = {
                fromEpoch: parseInt(epochData[epochFromIdx]),
                toEpoch: parseInt(epochData[epochIdx]),
                satIds: candidateSatIds.toArray()
            };
            if (obsWindows.length > 0 && obsWindows.at(-1).toEpoch > obsData.fromEpoch)
            {
                // overlapping with previous, merge
                obsWindows.at(-1).toEpoch = obsData.toEpoch;
            }
            else
            {
                obsWindows.push(obsData);
            }
        }

        // continue after this window
        ++epochIdx;
    }

    return obsWindows;
}
