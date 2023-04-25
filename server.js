import express from 'express';
import bodyParser from "body-parser";
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as sp3parser from './sp3parser.js';
import satellite from "satellite.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = JSON.parse(fs.readFileSync("settings.json"));
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

//const satData = sp3parser.parseFile('d:\\BME\\_ur\\2\\proj\\COD.EPH_5D', observer);
//const almanacData = almanacParser.parseFile('d:\\BME\\_ur\\2\\proj\\gnss.txt');
/*
for (const [constellationId, satellites] of Object.entries(satData)) {
    for (const [satId, epochs] of Object.entries(satellites)) {
        for (const [epoch, pos] of Object.entries(epochs)) {
            const posEcf = satellite.eciToEcf(pos, epoch);
            pos.lookAngles = satellite.ecfToLookAngles(observer, posEcf);
        }
    }
}
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
        height: parseFloat(req.body.height) / 1000.0 // [km]
    };

    res.json({
        satData: sp3parser.parseFile(config.gnssFilesPath + '/COD.EPH_5D', observer),
        //almanacData: almanacData
    });
});

app.listen(config.port, () => {
    console.log("Listening on :" + config.port);
});
