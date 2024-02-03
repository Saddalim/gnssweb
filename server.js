import * as planner from './planner/planner.js';
import * as stationMonitor from './stationMonitor/stationMonitor.js';
import * as mqttClient from './mqttClient/mqttClient.js';
import * as tcpServer from './tcpServer/tcpServer.js';
import * as recorderServer from './recorderServer/recorderServer.js';

console.log("Starting components...");

planner.startPlanner();
stationMonitor.startStationMonitor();
mqttClient.startMqttClient();
tcpServer.startTcpServer();
recorderServer.startRecorderServer();
