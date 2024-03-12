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
import * as mathUtils from "./mathUtils.js";
import {__dirname} from "./common.js";
import {sign} from "three/nodes";

let dataCache = {};
let ultraRapidCache = {};
export let waterLevelHistory = [];

const constellationData = {
    'G': { // GPS
        frequencies: { // By NMEA signal ID
            1: 1575.42e6, // L1 C/A
            6: 1227.6e6, // L2 CL
            5: 0.0, // TODO L2 CM
            7: 1176.45e6, // L5 I
            8: 1176.45e6, // L5 Q
        },
        defaultFrequency: 1
    },
    'E': { // Galileo
        frequencies: { // By NMEA signal ID
            7: 1575.42e6, // E1 C/B
            1: 1176.45e6, // E5a
            2: 1207.14e6, // E5b
        },
        defaultFrequency: 7
    },
    'C': { // BeiDou
        frequencies: { // By NMEA signal ID
            1: 1561.098e6, // B1I D1/2
            'B': 1207.14e6, // B2I D1/2
            3: 1575.42e6, // B1C
            5: 1176.45e6 // B2a
        },
        defaultFrequency: 1
    },
    'R': { // Glonass
        frequencies: { // By NMEA signal ID
            1: {base: 1602.0e6, step: 0.5625e6}, // L1OF
            3: {base: 1246.0e6, step: 0.4375e6}, // L2OF
        },
        defaultFrequency: 1,
        bands: {
             1:  1,  2: -4,  3:  5,  4:  6,  5:  1,
             6: -4,  7:  5,  8:  6,  9: -2, 10: -7,
            11:  0, 12: -1, 13: -2, 14: -7, 15:  0,
            16: -1, 17:  4, 18: -3, 19:  3, 20:  2,
            21:  4, 22: -3, 23:  3, 24:  2, 25: -5,
        }
    }
}

export function init()
{
    reparseUltraRapid();
    loadWaterLevelHistory();
}

async function downloadDataFile(year, dayOfYear)
{
    return new Promise((resolve, reject) => {

        const fileName = `COD0OPSFIN_${year}${dayOfYear.toString().padStart(3, '0')}0000_01D_05M_ORB.SP3`;
        const url = `http://ftp.aiub.unibe.ch/CODE/${year}/` + fileName + '.gz';
        const destinationFile = path.join(common.config.gnssFilesPath, fileName);
        let success = false;

        let request = http.get(url, function(response) {
            if (response.statusCode === 404)
            {
                reject("No final orbit available (yet?)");
                return;
            }

            const gunzip = zlib.createGunzip();

            let file = fs.createWriteStream(destinationFile);
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
                    reject("Corrupt final orbit file");
            });
        }).on('error', function(err) {
            fs.unlink(destinationFile); // async delete
            console.error(err.message);
            reject("Could not connect to AIUB");
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
    const epocha = time.toEpochSecond(ZoneOffset.UTC);

    let year = time.year();
    let dayOfYear = time.dayOfYear();

    let timesAsArray = [];

    let foundInUltraRapid = false;
    if (ultraRapidCache.hasOwnProperty(constellationId) &&
        ultraRapidCache[constellationId].hasOwnProperty(satId))
    {
        const times = Object.keys(ultraRapidCache[constellationId][satId]);
        if (epocha > parseInt(times[0]) && epocha < parseInt(times[times.length - 1]))
        {
            timesAsArray = Object.entries(ultraRapidCache[constellationId][satId]);
            foundInUltraRapid = true;
        }
    }

    if (!foundInUltraRapid)
    {
        if (! dataCache.hasOwnProperty(year))
        {
            dataCache[year] = {};
        }
        if (! dataCache[year].hasOwnProperty(dayOfYear))
        {
            dataCache[year][dayOfYear] = await readDailyData(year, dayOfYear);
        }
        timesAsArray = Object.entries(dataCache[year][dayOfYear][constellationId][satId]);
    }

    const epochToLookFor = time.toEpochSecond(ZoneOffset.ofHours(0));
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
        const interpPos = mathUtils.lerpAll(timesAsArray[epochIdx0][1].pos, timesAsArray[epochIdx1][1].pos, a);
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

export function collectObservationWindows(observer, excludePast)
{
    // TODO parse when new file is available and cache
    const rawData = sp3parser.parseFile(path.join(common.config.gnssFilesPath, 'COD.EPH_5D'), observer);

    const windowMargin = 5 * 60; // [s] time before and after a sat window to observe

    let obsWindows = [];
    let windowsByEpoch = {};

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
                fromEpoch: parseInt(epochData[epochFromIdx]) - windowMargin,
                toEpoch: parseInt(epochData[epochIdx]) + windowMargin,
                satIds: candidateSatIds.toArray()
            };

            if (!excludePast || obsData.toEpoch > Math.floor(Date.now() / 1000))
            {
                if (obsWindows.length > 0 && obsWindows.at(-1).toEpoch >= obsData.fromEpoch)
                {
                    // overlapping with previous, merge
                    let prevWindow = obsWindows.at(-1);
                    prevWindow.toEpoch = obsData.toEpoch;
                    prevWindow.satIds = candidateSatIds.union(prevWindow.satIds).toArray();
                }
                else
                {
                    obsWindows.push(obsData);
                }
            }
        }

        // continue after this window
        ++epochIdx;
    }

    return obsWindows;
}

export function reparseUltraRapid()
{
    ultraRapidCache = sp3parser.parseFile(path.join(common.config.gnssFilesPath, 'COD.EPH_U'), null, true);
}

function getWaterLevelHistoryFileOfStation(stationId)
{
    return path.join(common.config.gnssFilesPath, `wlh${stationId}.json`);
}

export function loadWaterLevelHistory()
{
    for (const station of Object.values(common.stations))
    {
        const historyFile = getWaterLevelHistoryFileOfStation(station.id);
        waterLevelHistory[station.id] = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile)) : [];
    }
}

export function saveWaterLevelHistory(stationId)
{
    if (waterLevelHistory.hasOwnProperty(stationId))
    {
        fs.writeJsonSync(getWaterLevelHistoryFileOfStation(stationId), waterLevelHistory[stationId]);
    }
}

export function addWaterLevelMeasurements(stationId, measurements)
{
    if (! waterLevelHistory.hasOwnProperty(stationId))
    {
        waterLevelHistory[stationId] = [];
    }

    for (const waterDatum of measurements)
    {
        waterLevelHistory[stationId].push(waterDatum);
    }

    saveWaterLevelHistory(stationId);
}

export function getWaterLevelHistoryOf(stationId)
{
    if (waterLevelHistory.hasOwnProperty(stationId))
        return waterLevelHistory[stationId];
    return [];
}

export function getWaterLevelStatisticalHistoryOf(stationId)
{
    let statHistory = [];
    let prevTime = null;
    for (const historyDatum of getWaterLevelHistoryOf(stationId))
    {
        if (historyDatum.time === prevTime)
        {
            statHistory[statHistory.length - 1].h.push(historyDatum.height);
        }
        else
        {
            if (prevTime !== null)
                statHistory[statHistory.length - 1].h.sort();
            statHistory.push({time: historyDatum.time, h: [historyDatum.height]});
            prevTime = historyDatum.time;
        }
    }
    return statHistory;
}

export function getFrequencyOf(constellationId, satId, signalId)
{
    if (constellationId === 'R')
    {
        const realSignalId = signalId === 0 ? constellationData.R.defaultFrequency : signalId;
        return constellationData.R.frequencies[realSignalId].base + constellationData.R.bands[satId] * constellationData.R.frequencies[realSignalId].step;
    }
    else if (constellationData.hasOwnProperty(constellationId))
    {
        return constellationData[constellationId].frequencies[signalId === 0 ? constellationData[constellationId].defaultFrequency : signalId];
    }
    else
    {
        console.error("Unknown constellation ID: " + constellationId);
        return NaN;
    }
}

export function getWavelengthOfSignal(satSignalId)
{
    const idParts = satSignalId.split('/');
    const constellationId = idParts[0][0];
    const satId = idParts[0].substring(1);
    const signalId = idParts.length > 1 ? parseInt(idParts[1]) : 0;
    return mathUtils.SPEED_OF_LIGHT / getFrequencyOf(constellationId, satId, signalId);
}

/**
 * Calculate water level height measurements from the given measurement data series
 * @param {*[]} dataSeries
 * @param {*[]} station
 * @param {boolean} withRawPeriodogram
 * @returns {*[]}
 */
export function calcHeight(dataSeries, station, withRawPeriodogram)
{
    const hstep = 0.01;

    let results = [];

    for (const [satId, data] of Object.entries(dataSeries))
    {
        const filteredData = data
            .filter(datum => !isNaN(datum.elev) && !isNaN(datum.snr))
            .filter(datum => mathUtils.isWithin(datum.elev, station.elevationLimits) && mathUtils.isWithin(datum.azim, station.azimuthLimits));

        if (filteredData.length < 250) continue;

        const carrierWavelength = getWavelengthOfSignal(satId);

        const f = mathUtils.arange(
            4.0 * Math.PI * station.heightLimits.min / carrierWavelength,
            4.0 * Math.PI * station.heightLimits.max / carrierWavelength,
            4.0 * Math.PI * hstep / carrierWavelength
        );

        const dataTime = data.reduce((maxTime, datum) => datum.time > maxTime ? datum.time : maxTime, 0);
        const elevSin = filteredData.map(datum => Math.sin(datum.elev));
        const elevSnrs = filteredData.map(datum => datum.snr);

        const fitFunction = mathUtils.quadraticFit(elevSin, elevSnrs);

        const ls = mathUtils.lombScargle(
            elevSin,
            elevSnrs.map((snr, idx) => snr - (fitFunction[0] + fitFunction[1] * elevSin[idx] + fitFunction[2] * elevSin[idx]**2)),
            f,
            true
        );

        const maxFreqIdx = ls.reduce((maxIdx, currAmp, currIdx, arr) => currAmp > arr[maxIdx] ? currIdx : maxIdx, 0);

        let measurement = {
            time: dataTime,
            height: f[maxFreqIdx] * carrierWavelength / (4.0 * Math.PI)
        };

        if (withRawPeriodogram)
        {
            measurement.periodogram = {
                satId: satId,
                f: f.map(f => Math.round(((f * carrierWavelength / (4.0 * Math.PI)) + Number.EPSILON) * 100) / 100),
                a: ls,
                elevSin: elevSin,
                elevSnrs: elevSnrs,
                trendLine: fitFunction
            };
        }

        results.push(measurement);
    }

    return results;
}
