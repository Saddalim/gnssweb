import * as common from '../common/common.js';
import * as satUtils from '../common/satUtils.js';
import * as logUtils from '../common/logUtils.js';
import * as history from '../common/history.js';
import mqtt from "mqtt";
import fs from "fs-extra";
import * as stationMonitor from "../stationMonitor/stationMonitor.js";
import path from "path";
import {getLogData} from "../common/logUtils.js";
import {addWaterLevelMeasurements} from "../common/satUtils.js";

const __dirname = common.__dirname + '/mqttClient';
const config = common.config.mqtt;

function getNewLogFilePath(stationId)
{
    return path.join(common.config.logFilePath, "ST" + stationId + '_' + new Date().toISOString().replaceAll(/[:.]/g, '-') + '.log');
}

function openNewLogFile(stationId)
{
    let fileName = getNewLogFilePath(stationId);
    console.log("Opening new log file: " + fileName);
    obsLoggers[stationId] = fs.createWriteStream(fileName, { flags: 'a' });
}

function getMeteoDataFromPayload(payload)
{
    return {
        boardTemp: Math.round(payload.readFloatBE(0) * 100) / 100,
        ambientTemp: Math.round(payload.readFloatBE(4) * 100) / 100,
        pressure: Math.round(payload.readFloatBE(8)) / 100,
        humidity: Math.round(payload.readFloatBE(12) * 100) / 100
    };
}

function logMessage(topic, payload)
{
    if (topic.startsWith("obs/")) return;

    let logMsg = new Date().toISOString() + " ";
    logMsg += topic;
    if (topic.startsWith("obswindow/resp/"))
    {
        logMsg += "|" + payload;
    }
    else if (topic.startsWith("meteo/"))
    {
        logMsg += "|" + JSON.stringify(getMeteoDataFromPayload(payload));
    }
    else if (topic.startsWith("status/"))
    {
        logMsg += "|" + payload;
    }
    logMsg += '\n';
    fs.outputFileSync(path.join(common.config.msgLogFilePath, "msg.log"), logMsg, { flag: 'a' });
}

let obsLoggers = {};


export function startMqttClient()
{

    const mqttClient = mqtt.connect(config.server, {username: "node", password: "q", keepalive: 60});

    mqttClient.on("error", (error) => {
        console.error("MQTT connection error: " + error);
    });

    mqttClient.on("connect", () => {
        console.log("MQTT connected");
        mqttClient.subscribe("obswindow/req/+", {qos: 0});
        mqttClient.subscribe("obs/+", {qos: 0});
        mqttClient.subscribe("meteo/+", {qos: 0});
        mqttClient.subscribe("obsctrl/#", {qos: 0});
        mqttClient.subscribe("status/+", {qos: 0});
    });

    mqttClient.on("message", (topic, message) => {

        logMessage(topic, message);

        if (topic.startsWith("obswindow/"))
        {
            let cmdTokens = topic.split('/');
            if (cmdTokens.length < 3)
            {
                console.error("Incorrect obswindow topic syntax: " + topic);
                return;
            }

            if (cmdTokens[1] === "req")
            {
                let stationId = parseInt(cmdTokens[2]);
                console.log(`Station #${stationId} requested observation data`);
                if (!common.stations.hasOwnProperty(stationId))
                {
                    console.error("Unknown station ID: " + stationId);
                    return;
                }

                const observer = common.stations[stationId];
                let observationData = satUtils.collectObservationWindows(observer, true);
                let topic = "obswindow/resp/" + stationId;
                let payload = observationData.map((data) => data.fromEpoch + ';' + data.toEpoch + ';' + data.satIds.join(',')).join('|') + '$';
                if (config.shadow !== true)
                {
                    mqttClient.publish(
                        topic,
                        payload,
                        {qos: 0, retain: false}
                    );
                    logMessage(topic, JSON.stringify(observationData));
                }
                stationMonitor.updateLastActivity(stationId);
            }
            else
            {
                console.error("Unknown obswindow subcommand: " + cmdTokens[1]);
            }
        }
        else if (topic.startsWith("obsctrl/"))
        {
            let cmdTokens = topic.split('/');
            if (cmdTokens.length < 3)
            {
                console.error("Incorrect obsctrl topic syntax: " + topic);
                return;
            }
            let stationId = parseInt(cmdTokens[2]);

            if (cmdTokens[1] === "start")
            {
                if (obsLoggers.hasOwnProperty(stationId))
                {
                    console.warn("Duplicate obsctr/start for station #" + stationId);
                }
                else
                {
                    console.log(`Station #${stationId} started observation stream`);
                    openNewLogFile(stationId);

                    stationMonitor.setRecordingState(stationId, true, []);
                }
            }
            else if (cmdTokens[1] === "end")
            {
                if (obsLoggers.hasOwnProperty(stationId))
                {
                    console.log(`Station #${stationId} ended observation stream`);
                    obsLoggers[stationId].end();
                    if (fs.statSync(obsLoggers[stationId].path).size > 0)
                    {
                        logUtils.transformLogfile(obsLoggers[stationId].path, common.stations[stationId])
                            .then(() => {
                                console.log("Finished processing logfile: " + obsLoggers[stationId].path);
                                return getLogData(obsLoggers[stationId].path, common.stations[stationId]);
                            }).then((dataSeries) => {
                                const newWaterLevelData = satUtils.calcHeight(dataSeries);
                                addWaterLevelMeasurements(stationId, newWaterLevelData);
                            });
                    }
                    else
                    {
                        fs.unlink(obsLoggers[stationId].path);
                    }
                    delete obsLoggers[stationId];

                    stationMonitor.setRecordingState(stationId, false, []);
                }
                else
                {
                    console.warn("Trying to close never started obs log for station #" + stationId);
                }
            }
            else
            {
                console.error("Unknown obsctrl subcommand: " + cmdTokens[1]);
            }
        }
        else if (topic.startsWith("obs/"))
        {
            const cmdTokens = topic.split('/');
            if (cmdTokens.length < 2)
            {
                console.error("Incorrect obs topic syntax: " + topic);
                return;
            }

            const stationId = parseInt(cmdTokens[1]);

            if (! obsLoggers.hasOwnProperty(stationId))
            {
                openNewLogFile(stationId);
            }

            const timestamp = message.readBigInt64BE(0);
            const obsDataContainsSignalId = ((message.length - 8) % 4) === 0;
            const satCnt = (message.length - 8) / (obsDataContainsSignalId ? 4 : 3);
            let satData = [];
            for (let satIdx = 0; satIdx < satCnt; ++satIdx)
            {
                const constellationId = String.fromCharCode(message.readUint8(8 + satIdx * 4));
                const satId = message.readUint8(8 + satIdx * 4 + 1);
                const snr = message.readUint8(8 + satIdx * 4 + 2);
                const signalId = obsDataContainsSignalId ? message.readUint8(8 + satIdx * 4 + 3) : 0;
                satData.push({
                    constellationId: constellationId,
                    satId: satId,
                    snr: snr,
                    signalId : signalId
                });
            }

            obsLoggers[stationId].write(timestamp + ';' + satData.map((datum) => datum.constellationId + datum.satId + '/' + datum.signalId + '=' + datum.snr).join(',') + '|');

            stationMonitor.setRecordingState(stationId, true, satData.map(data => data.constellationId + data.satId));
        }
        else if (topic.startsWith("cmd/"))
        {

        }
        else if (topic.startsWith("status/"))
        {
            let cmdTokens = topic.split('/');
            if (cmdTokens.length < 2)
            {
                console.error("Malformed status message: " + topic);
                return;
            }
            let stationId = parseInt(cmdTokens[1]);
            stationMonitor.updateLastActivity(stationId);

            console.info(`STATUS from station ${stationId}: ` + message.toString());

        }
        else if (topic.startsWith("meteo/"))
        {
            let cmdTokens = topic.split('/');
            if (cmdTokens.length < 2)
            {
                console.error("Malformed meteo message: " + topic);
                return;
            }
            let stationId = parseInt(cmdTokens[1]);

            if (message.length < 16)
            {
                console.error(`Malformed meteo payload from station ${stationId}: ` + message.toString());
                return;
            }

            const meteoData = getMeteoDataFromPayload(message);
            history.addToMeteoHistory(stationId, meteoData);
            stationMonitor.updateLastActivity(stationId);

            console.log(`METEO from station ${stationId}: board: ${meteoData.boardTemp.toFixed(2)}°C, ambient: ${meteoData.ambientTemp.toFixed(2)}°C, pressure: ${meteoData.pressure.toFixed(2)}hPa, humidity: ${meteoData.humidity.toFixed(2)}%`);
        }
    });

    mqttClient.on("offline",function(){
        console.log("MQTT offline");
        mqttClient.end();
    });

}
