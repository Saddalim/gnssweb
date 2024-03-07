import * as common from './common/common.js';
import * as satUtils from './common/satUtils.js';
import * as logUtils from './common/logUtils.js';
import * as mathUtils from './common/mathUtils.js';
import * as history from './common/history.js';
import {LocalDate, LocalDateTime, LocalTime} from "@js-joda/core";
import satellite from "satellite.js";
import fs from "fs";
import * as predictionFetcher from "./predictionFetcher/predictionFetcher.js";

const logDir = '/home/johnny/bme/gnss_logs/';
const file = '/home/johnny/bme/gnss_logs/ST1_2024-01-24T16-40-00-041Z.log';

const str = 'G12/2=20';
const g1 = str.split('=');
const g2 = g1[0].split('/');
console.log(g1, g2);
/*
const csvFile = 'd:\\BME\\_ur\\diploma\\log\\ST1_2024-01-21T16-50-01-220Z.log';
const satData = await logUtils.getLogData(csvFile, common.stations[1]);

const carrierVelocity = 299792458.0; // [m/s]
const carrierFreq = 1575.42e6; // [Hz]
const carrierWavelength = carrierVelocity / carrierFreq; // [m]

const minh = 1;
const maxh = 10;
const hstep = 0.1;

const f = mathUtils.arange(
    4.0 * Math.PI * minh / carrierWavelength,
    4.0 * Math.PI * maxh / carrierWavelength,
    4.0 * Math.PI * hstep / carrierWavelength
);

for (let [satId, data] of Object.entries(satData))
{
    data.sort((a, b) => a.elev - b.elev);
    const ls = mathUtils.lombScargle(data.map(datum => datum.elev), data.map(datum => datum.snr), f);
    console.log(ls);
}
*/

//console.log(satUtils.collectObservationWindows(common.stations[3], true));

//(async () => {await logUtils.fixAllLogFilesIn(common.config.logFilePath);})();

//(async () => {console.log(await logUtils.getListOfLogFiles(common.config.logFilePath, 1));})();

//console.log(satUtils.collectObservationWindows(observer));

/*
let data = satUtils.getLookAnglesOfSat(
    'G',
    1,
    LocalDateTime.of(LocalDate.of(2024, 1, 3), LocalTime.of(13, 0, 0)),
    {
        latitude: satellite.degreesToRadians(47),
        longitude: satellite.degreesToRadians(19),
        height: 100.0 / 1000.0
    });
data.then((datum) => {
    console.log(datum);
});
*/
