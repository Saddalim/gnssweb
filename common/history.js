import * as common from '../common/common.js';
import * as readline from 'readline';
import * as fs from 'fs';
import path from "path";

let cache = {};

async function readMeteoHistory(observerId)
{
    let history = [];

    const fileStream = fs.createReadStream(path.join(common.config.msgLogFilePath, '/msg.log'));
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const meteoRegex = new RegExp(`^([0-9\-T\:\.Z]{24}) meteo\/${observerId}\\|(.*?)$`);

    try
    {
        for await (const line of rl) {
            const match = line.match(meteoRegex);
            if (match)
            {
                const datum = JSON.parse(match[2]);
                datum.time = match[1];
                history.push(datum);
            }
        }
    }
    catch (ex) {}

    cache[observerId].meteo = history;
}

export async function getMeteoHistory(observerId)
{
    if (! cache.hasOwnProperty(observerId))
        cache[observerId] = {};

    if (! cache[observerId].hasOwnProperty('meteo'))
        await readMeteoHistory(observerId);

    if (! cache[observerId].hasOwnProperty('meteo'))
        cache[observerId].meteo = [];

    return cache[observerId].meteo;
}

export function addToMeteoHistory(observerId, meteoDatum)
{
    if (! cache.hasOwnProperty(observerId))
        cache[observerId] = {};

    if (! cache[observerId].hasOwnProperty('meteo'))
        cache[observerId].meteo = [];

    meteoDatum.time = (new Date()).toISOString();
    cache[observerId]['meteo'].push(meteoDatum);

}
