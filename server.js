import express from 'express';
import bodyParser from "body-parser";
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as sp3parser from './sp3parser.js';
import * as utils from './public/utils.js';
import satellite from "satellite.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = JSON.parse(fs.readFileSync(__dirname + "/settings.json"));
console.log("Config:", config);

// set up GNSS data

// Dani terasza
/*
const observer = {
    latitude: satellite.degreesToRadians(47.461412),
    longitude: satellite.degreesToRadians(18.928819),
    height: 0.190 // [km]
};
*/

// set up HTTP server

const app = express();
let urlencodedParser = bodyParser.urlencoded({ extended: false });

app.use(express.static(path.join(__dirname, '/public')));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/req', urlencodedParser, (req, res) => {
    console.log('POST!', req.body);

    const observer = {
        latitude: satellite.degreesToRadians(parseFloat(req.body.lat)),
        longitude: satellite.degreesToRadians(parseFloat(req.body.lon)),
        height: parseFloat(req.body.height) / 1000.0, // [km]
        azimuthLimits: {min: satellite.degreesToRadians(parseFloat(req.body.azim_min)), max: satellite.degreesToRadians(parseFloat(req.body.azim_max))},
        elevationLimits: {min: satellite.degreesToRadians(parseFloat(req.body.elev_min)), max: satellite.degreesToRadians(parseFloat(req.body.elev_max))}
    };

    // TODO parse when new file is available and cache
    const rawData = sp3parser.parseFile(config.gnssFilesPath + '/COD.EPH_5D', observer);

    let visibilityTimesPerSat = {};
    let elevationDatasets = [];
    let positionDatasets = [];

    for (const [constellationId, satellites] of Object.entries(rawData)) {
        for (const [satId, epochs] of Object.entries(satellites)) {
            let elevationDataset = [];
            let positionDataset = [];
            for (const [epoch, epochData] of Object.entries(epochs)) {

                let epochNum = parseInt(epoch);

                // elevation data
                // TODO take elevation into account while filtering for elevation - a sat with negative elevation might be visible for an observer high enough
                elevationDataset.push({
                    x: epochNum * 1000, // JS handles epoch 1970 timestamps in milliseconds
                    y: epochData.lookAngles.elevation > 0.0 ? utils.rad2deg(epochData.lookAngles.elevation) : null
                });

                // visibility data
                if (utils.isAngleBetween(epochData.lookAngles.azimuth, observer.azimuthLimits.min, observer.azimuthLimits.max)
                    && utils.isAngleBetween(epochData.lookAngles.elevation, observer.elevationLimits.min, observer.elevationLimits.max)) {
                    if (!visibilityTimesPerSat.hasOwnProperty(constellationId + satId))
                        visibilityTimesPerSat[constellationId + satId] = [];
                    visibilityTimesPerSat[constellationId + satId].push(epochNum);
                }

                // position data
                positionDataset.push({
                    x: epochData.pos.x,
                    y: epochData.pos.y,
                    z: epochData.pos.z
                });
            }

            elevationDatasets.push({
                label: constellationId + satId,
                data: elevationDataset,
                borderColor: utils.getColorStrForConstellationId(constellationId),
                borderWidth: 1.5
            });
            positionDatasets.push({
                label: constellationId + satId,
                data: positionDataset,
                constellationId: constellationId,
            })
        }
    }

    res.json({
        visibilityData: visibilityTimesPerSat,
        elevationData: elevationDatasets,
        positionData: positionDatasets
    });
});

app.listen(config.port, () => {
    console.log("Listening on :" + config.port);
});
