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

const stationId = 1;

(async () => {
    const logFileList = await logUtils.getListOfLogFiles(common.config.logFilePath, stationId);
    for (const logFile of logFileList)
    {
        const logFilePath = path.join(common.config.logFilePath, logFile);
        await logUtils.transformLogfile(logFilePath, common.stations[stationId]);
        const logData = await logUtils.getLogData(logFilePath, common.stations[stationId]);
        const newWaterLevelData = satUtils.calcHeight(logData, false);
        addWaterLevelMeasurements(stationId, newWaterLevelData);
    }
})();
