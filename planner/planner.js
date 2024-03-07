import * as common from '../common/common.js';
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import satellite from "satellite.js";
import * as sp3parser from "../common/sp3parser.js";
import * as utils from "../public/utils.js";
import {LocalDateTime, ZoneOffset} from "@js-joda/core";

const __dirname = common.__dirname + '/planner';
const config = common.config.planner;

const app = express();
let urlencodedParser = bodyParser.urlencoded({ extended: false });

app.use(express.static(path.join(common.__dirname, '/public')));

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
    const rawData = sp3parser.parseFile(path.join(common.config.gnssFilesPath, 'COD.EPH_5D'), observer);

    let visibilityTimesPerSat = {};
    let visibilityLineDatasets = [];
    let elevationDatasets = [];
    let positionDatasets = [];

    let satIdx = 0;

    for (const [constellationId, satellites] of Object.entries(rawData)) {
        for (const [satId, epochs] of Object.entries(satellites)) {
            ++satIdx;
            let visibilityLineDataset = [];
            let elevationDataset = [];
            let positionDataset = [];
            for (const [epoch, epochData] of Object.entries(epochs)) {

                let epochNum = parseInt(epoch);
                const isInWindow = utils.isAngleBetween(epochData.lookAngles.azimuth, observer.azimuthLimits.min, observer.azimuthLimits.max)
                    && utils.isAngleBetween(epochData.lookAngles.elevation, observer.elevationLimits.min, observer.elevationLimits.max);

                // elevation data
                // TODO take elevation into account while filtering for elevation - a sat with negative elevation might be visible for an observer high enough
                elevationDataset.push({
                    x: epochNum * 1000, // JS handles epoch 1970 timestamps in milliseconds
                    y: isInWindow ? (epochData.lookAngles.elevation > 0.0 ? utils.rad2deg(epochData.lookAngles.elevation) : null) : null
                });

                // visibility data

                if (isInWindow) {
                    if (!visibilityTimesPerSat.hasOwnProperty(constellationId + satId))
                        visibilityTimesPerSat[constellationId + satId] = [];
                    visibilityTimesPerSat[constellationId + satId].push(epochNum * 1000);

                    visibilityLineDataset.push({
                        x: epochNum * 1000,
                        y: satIdx,
                        azimuth: utils.rad2deg(parseFloat(epochData.lookAngles.azimuth)),
                        elevation: utils.rad2deg(parseFloat(epochData.lookAngles.elevation))
                    });
                }
                else
                {
                    visibilityLineDataset.push({
                        x: epochNum * 1000,
                        y: null
                    });
                }

                // position data
                positionDataset.push({
                    x: epochData.pos.x,
                    y: epochData.pos.y,
                    z: epochData.pos.z
                });
            }

            visibilityLineDatasets.push({
                label: constellationId + satId,
                data: visibilityLineDataset,
                borderColor: utils.getColorStrOfConstellation(constellationId),
                borderWidth: 3
            });
            elevationDatasets.push({
                label: constellationId + satId,
                data: elevationDataset,
                borderColor: utils.getColorStrOfConstellation(constellationId),
                borderWidth: 1.5,
                interpolate: true
            });
            positionDatasets.push({
                label: constellationId + satId,
                data: positionDataset,
                constellationId: constellationId,
            });
        }
    }

    // calculate observer location in ECI
    let observerPositionData = [];
    const observerECF = satellite.geodeticToEcf(observer);
    for (const visibilityLineDataset of visibilityLineDatasets[0].data) {
        const localDateTime = LocalDateTime.ofEpochSecond(visibilityLineDataset.x / 1000, ZoneOffset.UTC);
        const gsTime = satellite.gstime(localDateTime.year(), localDateTime.monthValue() - 1, localDateTime.dayOfMonth(), localDateTime.hour(), localDateTime.minute(), localDateTime.second());
        observerPositionData.push(satellite.ecfToEci(observerECF, gsTime));
    }

    res.json({
        visibilityData: visibilityTimesPerSat,
        visibilityLineData: visibilityLineDatasets,
        elevationData: elevationDatasets,
        positionData: positionDatasets,
        observerPositionData: observerPositionData
    });
});

export function startPlanner()
{
    app.listen(config.port, () => {
        console.log("Planner listening on :" + config.port);
    });
}
