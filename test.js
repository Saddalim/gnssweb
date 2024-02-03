import * as common from './common/common.js';
import * as satUtils from './common/satUtils.js';
import * as logUtils from './common/logUtils.js';
import * as history from './common/history.js';
import {LocalDate, LocalDateTime, LocalTime} from "@js-joda/core";
import satellite from "satellite.js";
import fs from "fs";

const logDir = '/home/johnny/bme/gnss_logs/';
const file = '/home/johnny/bme/gnss_logs/ST1_2023-12-20T03-00-00-630Z.log';

(async () => {await logUtils.fixAllLogFilesIn(common.config.logFilePath);})();

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
