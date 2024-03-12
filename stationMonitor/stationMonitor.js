import * as common from '../common/common.js';
import * as history from '../common/history.js';
import * as logUtils from '../common/logUtils.js';
import * as satUtils from '../common/satUtils.js';
import express from 'express';
import http from 'http';
import {Server} from 'socket.io';
import path from "path";
import bodyParser from "body-parser";
import {getWaterLevelStatisticalHistoryOf} from "../common/satUtils.js";

const __dirname = common.__dirname + '/stationMonitor';
const config = common.config.stationMonitor;

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
let lastKnownActivities = {};

let urlencodedParser = bodyParser.urlencoded({ extended: false });

app.use(express.static(path.join(common.__dirname, '/public')));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/meteo', urlencodedParser, async (req, res) => {
    const stationId = parseInt(req.body.sid);
    const meteoHistory = await history.getMeteoHistory(stationId);
    if (! lastKnownActivities.hasOwnProperty(stationId) && meteoHistory.length > 0)
    {
        lastKnownActivities[stationId] = meteoHistory[meteoHistory.length - 1].time;
        io.emit('activity', {sid: stationId, time: lastKnownActivities[stationId]});
    }
    res.json(meteoHistory);
});

app.post('/logList', urlencodedParser, async (req, res) => {
    res.json(await logUtils.getListOfLogFiles(common.config.logFilePath, parseInt(req.body.sid)));
});

app.post('/snrLog', urlencodedParser, async (req, res) => {
    try
    {
        const data = await logUtils.getLogData(path.join(common.config.logFilePath, req.body.logFile), common.stations[req.body.sid]);
        res.json({
            snr: data,
            periodogram: satUtils.calcHeight(data, common.stations[req.body.sid], true)
        });
    }
    catch (ex)
    {
        res.json({error: ex});
    }
});

app.post('/wl', urlencodedParser, async (req, res) => {
    res.json(await satUtils.getWaterLevelStatisticalHistoryOf(parseInt(req.body.sid)));
});

io.on('connection', (socket) => {
    for (const [stationId, lastActivityTime] of Object.entries(lastKnownActivities))
    {
        socket.emit('activity', {sid: stationId, time: lastActivityTime});
    }
});

export function startStationMonitor()
{
    httpServer.listen(config.port, () => {
        console.log("Station monitor listening on :" + config.port);
    });
}

export function updateLastActivity(stationId)
{
    lastKnownActivities[stationId] = Date.now();
    io.emit('activity', {sid: stationId, time: lastKnownActivities[stationId]});
}

export function setRecordingState(stationId, isRecording, satIds)
{
    io.emit('recordingState', {sid: stationId, state: isRecording, satIds: satIds});
    updateLastActivity(stationId);
}