import * as schedule from 'node-schedule';
import http from 'http';
import fs from "fs";
import path from "path";
import * as common from "../common/common.js";
import * as satUtils from '../common/satUtils.js';

export function fetchUltraRapid()
{
    console.log("Downloading ultra-rapid orbits");
    const file = fs.createWriteStream(path.join(common.config.gnssFilesPath, 'COD.EPH_U'));
    const request = http.get("http://ftp.aiub.unibe.ch/CODE/COD.EPH_U", (response) => {
        response.pipe(file);
        file.on("finish", () => {
            file.close();
            console.log("Ultra-rapid orbits downloaded");
            satUtils.reparseUltraRapid();
        });
    });
}

export function fetchPredictions()
{
    console.log("Downloading 5-day predctions");
    const file = fs.createWriteStream(path.join(common.config.gnssFilesPath, 'COD.EPH_5D'));
    const request = http.get("http://ftp.aiub.unibe.ch/CODE/COD.EPH_5D", (response) => {
        response.pipe(file);
        file.on("finish", () => {
            file.close();
            console.log("5-day predictions downloaded");
        });
    });
}

export function scheduleFetch()
{
    schedule.scheduleJob("15 1,7,13,19 * * *", fetchUltraRapid);
    schedule.scheduleJob("15 7 * * *", fetchPredictions);
}