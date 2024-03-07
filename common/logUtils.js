import * as satUtils from './satUtils.js';
import fs from "fs";
import path from "path";
import * as common from "./common.js";
import readline from "readline";
import {log, sign} from "three/nodes";

export function fixAllLogFilesIn(logDir)
{
    fs.readdirSync(logDir).forEach(file => {
        if (file.endsWith('.log'))
        {
            console.log("Fixing: " + file);
            fixLogFile(path.join(logDir, file));
        }
    });

}
/**
 * I forgot to add a '|' delimiter between messages in logfiles until 2024-01-21. This script fixes them by adding the delimiter
 * @param logfile
 */
export function fixLogFile(logfile)
{
    const msgPattern = /[0-9]{10};(?:[A-Z0-9]+=[0-9]{0,2},?)+/g;
    const rawData = fs.readFileSync(logfile, 'ascii');
    if (rawData.indexOf('|') !== -1)
    {
        // already fixed
        console.log("Log doesn't need fix: " + logfile);
        return;
    }
    const out = fs.createWriteStream(logfile, 'ascii');
    const msgs = rawData.matchAll(msgPattern);
    for (const msg of msgs)
    {
        out.write(msg[0] + '|');
    }
    out.close();
}

export async function transformLogfile(logfile, observer)
{
    return new Promise(async (resolve, reject) => {
        try {
            const outputFile = logfile + '.csv';
            const rawData = fs.readFileSync(logfile, 'ascii');

            console.log("Transforming log file: " + logfile);

            let satIds = [];
            let data = [];

            for (const msg of rawData.split('|')) {
                if (msg.length === 0)
                    continue;

                const msgParts = msg.split(';');
                if (msgParts.length !== 2) {
                    console.error("Incorrect msg part cnt: " + msgParts.length);
                    continue;
                }
                const timestamp = parseInt(msgParts[0]);
                let timeData = [];
                for (const satData of msgParts[1].split(',')) {
                    const satParts = satData.split('=');
                    if (satParts.length !== 2) {
                        console.error("Incorrect sat data part cnt: " + satParts.length);
                        continue;
                    }
                    const satSignalId = satParts[0];
                    const signalParts = satSignalId.split('/');
                    const satId = signalParts[0];
                    const signalId = signalParts.length > 1 ? signalParts[1] : 0;
                    const snr = parseInt(satParts[1]);

                    let idx = satIds.findIndex((id) => id === satSignalId);
                    if (idx === -1) {
                        idx = satIds.length;
                        satIds.push(satSignalId);
                    }
                    const lookAngles = await satUtils.getLookAnglesOfSat(satId[0], parseInt(satId.substring(1)), timestamp, observer);
                    timeData[idx] = [lookAngles.azimuth, lookAngles.elevation, snr];
                }
                data.push({
                    time: timestamp,
                    data: timeData
                });
            }

            const out = fs.createWriteStream(outputFile, 'ascii');
            out.write('time,' + satIds.map((satId) => [satId + '_azim', satId + '_elev', satId + '_snr'].join(',')).join(',') + '\n');
            for await (const datum of data) {
                out.write(datum.time + ',');
                for (let satIdx = 0; satIdx < satIds.length; ++satIdx) {
                    if (Array.isArray(datum.data[satIdx]))
                        out.write(datum.data[satIdx].join(','));
                    else
                        out.write(',,');

                    if (satIdx < satIds.length - 1)
                        out.write(',');
                }
                out.write('\n');
            }
            out.close(() => resolve());
        }
        catch (error) { reject(error); }
    });
}

export async function getListOfLogFiles(logDir, stationId)
{
    return new Promise((resolve, reject) => {
        fs.readdir(logDir, (err, files) => {
            if (err) {
                reject(err);
                return;
            }

            const logFiles = files.filter(file => path.extname(file) === '.log' && file.startsWith("ST" + stationId));
            resolve(logFiles);
        });
    });
}

export async function getLogData(logFile, observer)
{
    if (logFile.length === 0) return [];
    const csvFile = logFile.endsWith('.csv') ? logFile : (logFile + '.csv');

    console.log("Displaying log file: " + logFile);

    try
    {
        if (! fs.existsSync(csvFile))
        {
            if (! fs.existsSync(logFile))
                throw new Error("No such log file: " + logFile);

            await transformLogfile(logFile, observer);
        }
    }
    catch (ex)
    {
        return {error: ex};
    }

    const fileStream = fs.createReadStream(csvFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let data = {};
    let satNames = [];
    let gotHeader = false;
    for await (const line of rl) {

        const cols = line.split(',');
        const satCnt = (cols.length - 1) / 3;

        if (!gotHeader)
        {
            for (let satIdx = 0; satIdx < satCnt; ++satIdx)
            {
                const satName = cols[1 + satIdx * 3].split('_')[0];
                data[satName] = [];
                satNames.push(satName);
            }
            gotHeader = true;
            continue;
        }

        const time = parseInt(cols[0]);
        for (let satIdx = 0; satIdx < satCnt; ++satIdx)
        {
            const satName = satNames[satIdx];
            data[satName].push({
                time: time,
                azim: parseFloat(cols[1 + satIdx * 3]),
                elev: parseFloat(cols[1 + satIdx * 3 + 1]),
                snr: parseInt(cols[1 + satIdx * 3 + 2])
            });
        }
    }

    return data;
}

