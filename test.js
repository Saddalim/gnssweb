import * as common from './common/common.js';
import * as satUtils from './common/satUtils.js';
import * as logUtils from './common/logUtils.js';
import * as sp3parser from './common/sp3parser.js';
import * as mathUtils from './common/mathUtils.js';
import * as history from './common/history.js';
import {LocalDate, LocalDateTime, LocalTime} from "@js-joda/core";
import satellite from "satellite.js";
import fs from "fs";
import path from "path";
import * as predictionFetcher from "./predictionFetcher/predictionFetcher.js";
import {getLogData} from "./common/logUtils.js";
import {addWaterLevelMeasurements} from "./common/satUtils.js";

satUtils.reparseUltraRapid();
/*
const stationId = 2;
const station = common.stations[stationId];
await logUtils.transformLogfile(path.join(common.config.logFilePath, "ST2_2024-03-11T17-25-42-197Z.log"), station);
*/

(async () => {
    for (const stationId of [1, 2])
    {
        const station = common.stations[stationId];
        const logFileList = await logUtils.getListOfLogFiles(common.config.logFilePath, stationId);
        for (const logFile of logFileList)
        {
            try
            {
                const logFilePath = path.join(common.config.logFilePath, logFile);
                await logUtils.transformLogfile(logFilePath, station);
                const logData = await logUtils.getLogData(logFilePath, common.stations[stationId]);
                const newWaterLevelData = satUtils.calcHeight(logData, station, false);
                addWaterLevelMeasurements(stationId, newWaterLevelData);
            }
            catch (ex) {}
        }

    }
})();
