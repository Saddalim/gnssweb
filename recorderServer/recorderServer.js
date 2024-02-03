import * as common from '../common/common.js';
import net from "net";

const __dirname = common.__dirname + '/recorderServer';
const config = common.config.recorderServer;

var recorderServer = net.createServer();

recorderServer.on('connection', (conn) => {

    console.log("New recorder connection: ", conn.remoteAddress);

    let stationId = null;
    let buffer = "";

    conn.on('data', (data) => {
        let payload = data.toString();
        buffer += payload;
        let endOfMsgIdx = buffer.indexOf('|');
        if (endOfMsgIdx === -1) return;

        let message = buffer.substring(0, endOfMsgIdx);
        buffer = buffer.substring(endOfMsgIdx + 1);

        if (message.startsWith('#'))
        {
            stationId = parseInt(message.substring(1));
            console.log("Station ID: " + stationId);
        }
        else
        {
            console.log('Recorder data: ' + message);
        }


    });
});

export function startRecorderServer()
{
    recorderServer.listen(config.port, () => {
        console.log('Recorder server listening on: ' + config.port);
    });
}
