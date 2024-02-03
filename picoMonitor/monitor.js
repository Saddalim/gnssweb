import fs from 'fs';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import {fileURLToPath} from "url";
import _ from 'underscore';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = JSON.parse(fs.readFileSync(__dirname + "/settings_monitor.json"));
console.log("Config:", config);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '/public')));

const messageDelimiter = new Uint8Array([0xb5, 0x62]);
const UBXheaderLength = 8;
const UBXpayloadOffset = 6;

let clients = [];
let lastFileRead = "";
let lastFileIdx = 0;
let fileChanged = false;
let fileWatcher = null;
let lastGnssStatus = null;
let lastGnssData = null;
let lastDataTime = null;

class UBX_NAV_SAT {

    constructor(payload) {
        const satCnt = payload.readUintLE(5, 1);
        console.log(payload.subarray(0, 4));
        this.dataTime = payload.readUintLE(0, 4);
        console.log(this.dataTime);
        this.satData = [];

        for (let satIdx = 0; satIdx < satCnt; ++satIdx) {
            const satDataIdx = 8 + satIdx * 12;

            this.satData.push({
                gnssId: payload.readUintLE(satDataIdx, 1),
                svId: payload.readUintLE(satDataIdx + 1, 1),
                cno: payload.readUintLE(satDataIdx + 2, 1),
                elev: payload.readUintLE(satDataIdx + 3, 1),
                azim: payload.readUintLE(satDataIdx + 4, 2)
            });

        }
    }

    toString() {
        return `UBX_NAV_SAT w/ ${this.satCnt} sats`;
    }

}

function getMostRecentFileName(dir) {
    var files = fs.readdirSync(dir);

    // use underscore for max()
    return _.max(files, function (f) {
        var fullpath = path.join(dir, f);

        // ctime = creation time is used
        // replace with mtime for modification time
        return fs.statSync(fullpath).ctime;
    });
}

function sendStatus(status) {
    if (status !== lastGnssStatus) {
        clients.forEach(client => {
            client.emit('gnss-status', { status: status });
        });
        lastGnssStatus = status;
    }
}

function refreshClients() {

    if (clients.length === 0)
        return;

    if (! fileChanged) {
        // Check if there reason for no change is a new file
        let newestFileName = getMostRecentFileName(config.logFilePath);
        if (newestFileName === lastFileRead) {
            if (Date.now() - lastDataTime > config.timeUntilConsideredDown) {
                console.warn("Possible GNSS connection loss!");
                sendStatus('nok');
            }
        } else {
            if (fileWatcher !== null) {
                fileWatcher.close();
            }

            console.log("New logfile to monitor: ", newestFileName);
            lastFileRead = newestFileName;
            const logFileName = path.join(config.logFilePath, lastFileRead);

            lastFileIdx = fs.statSync(logFileName).size;

            fileWatcher = fs.watch(logFileName, (event, filename) => {
                if (filename) {
                    //console.log(`${filename} has changed`);
                    fileChanged = true;
                    lastDataTime = Date.now();
                }
            });
        }

        return;
    }
    fileChanged = false;

    sendStatus('ok');

    const logFileName = path.join(config.logFilePath, lastFileRead);
    const logFileStats = fs.statSync(logFileName);
    const logFileSize = logFileStats.size;
    const bytesToRead = logFileSize - lastFileIdx;
    let buffer = Buffer.alloc(bytesToRead + 1);
    let logFile = fs.openSync(logFileName);
    fs.readSync(logFile, buffer, 0, bytesToRead, lastFileIdx);
    lastFileIdx = logFileSize;

    let searchFrom = 0;
    while (searchFrom < buffer.length) {
        const messageStartIdx = buffer.indexOf(messageDelimiter, searchFrom);
        if (messageStartIdx < 0)
            break;

        const messageClass = buffer[messageStartIdx + 2];
        const messageId = buffer[messageStartIdx + 3];
        const payloadLength = buffer.readUintLE(messageStartIdx + 4, 2);
        const messageLength = payloadLength + UBXheaderLength;

        if (messageClass === 0x01 && messageId === 0x35) {
            console.log(buffer.subarray(messageStartIdx, messageStartIdx + messageLength));
            lastGnssData = new UBX_NAV_SAT(buffer.subarray(messageStartIdx + UBXpayloadOffset, messageStartIdx + messageLength));

            clients.forEach(client => {
                client.emit('gnss-data', lastGnssData);
            });
        }

        searchFrom = messageStartIdx + messageLength;
    }
}

setInterval(refreshClients, config.clientRefreshInterval);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/monitor.html');
});

io.on('connection', (socket) => {
    console.log('a user connected');
    clients.push(socket);

    socket.emit('gnss-status', { status: lastGnssStatus});
    socket.emit('gnss-data', lastGnssData);

    socket.on('disconnect', () => {
        console.log('a user disconnected');
        const clientIdx = clients.findIndex(client => client.id === socket.id);
        if (-1 !== clientIdx)
            clients.splice(clientIdx, 1);
    });
});


server.listen(config.port, () => {
    console.log('listening on *:' + config.port);
});
