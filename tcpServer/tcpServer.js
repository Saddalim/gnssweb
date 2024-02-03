import * as common from '../common/common.js';
import net from "net";
import * as satUtils from "../common/satUtils.js";
import * as utils from "../public/utils.js";
import Immutable from "immutable";

const __dirname = common.__dirname + '/tcpClient';
const config = common.config.tcpServer;

var server = net.createServer();
server.on('connection', (conn) => {

    console.log("New connection: ", conn.remoteAddress);

    conn.on('data', (data) => {
        let req = data.toString();

        // Echo
        if (req.startsWith('e;'))
        {
            conn.write('Szevasz, ' + req.substring(2) + '$');
        }

        // Get Observation Times
        else if (req.startsWith('got;'))
        {
            let params = req.substring(4).split(',');
            if (params.length === 2)
            {
                let stationId = parseInt(params[0]);
                let timeWindow = parseInt(params[1]);
                console.log(`Station ${stationId} requested observation data with window: ${timeWindow}`);
                if (common.stations.hasOwnProperty(stationId))
                {
                    const observer = common.stations[stationId];
                    let observationData = satUtils.collectObservationWindows(observer);
                    conn.write(observationData.map((data) => data.fromEpoch + ';' + data.toEpoch + ';' + data.satIds.join(',')).join('|') + '$');
                }
                else
                {
                    conn.write('unknown station\n');
                }
            }
            else
            {
                conn.write('invalid param count\n');
            }
        }
        else
        {
            conn.write('invalid command\n');
        }
    });
});

export function startTcpServer()
{

    server.listen(config.port, () => {
        console.log('TCP server listening on: ' + config.port);
    });
}
