import * as utils from './utils.js';

const constellationData = {
    0: { // GPS
        prefix: 'G',
        color: {r: 0, g: 255, b: 0}
    },
    1: { // SBAS
        prefix: 'S',
        color: {r: 255, g: 255, b: 255}
    },
    2: { // Galileo
        prefix: 'E',
        color: {r: 0, g: 0, b: 255}
    },
    3: { // BeiDou
        prefix: 'B',
        color: {r: 255, g: 255, b: 0}
    },
    5: { // QZSS
        prefix: 'Q',
        color: {r: 100, g: 100, b: 255}
    },
    6: { // GLONASS
        prefix: 'R',
        color: {r: 255, g: 0, b: 0}
    }
}

const ECEFCANVASSIZE = 1000;
const ecefCanvasCenter = ECEFCANVASSIZE / 2;

const ecefStage = new Konva.Stage({
    container: 'canvas-sky',
    width: ECEFCANVASSIZE,
    height: ECEFCANVASSIZE
});

const fixLayer = new Konva.Layer();
const satLayer = new Konva.Layer();

// elevation circles
{
    const elevationStep = 30;
    const radiusStep = (1 / 90) * (ECEFCANVASSIZE / 2);
    for (let elevation = 0; elevation < 90; elevation += elevationStep) {
        const elevationCircle = new Konva.Circle({
            x: ecefCanvasCenter,
            y: ecefCanvasCenter,
            radius: ecefCanvasCenter - elevation * radiusStep,
            stroke: '#000',
            strokeWidth: 2
        });
        fixLayer.add(elevationCircle);
    }
}

// azimuth lines
{
    const azimuthStep = 30;
    const angleStep = (1 / 360);
    for (let azimuth = 0; azimuth < 360; azimuth += azimuthStep) {
        const azimuthLine = new Konva.Line({
            points: [
                ecefCanvasCenter,
                ecefCanvasCenter,
                ecefCanvasCenter - Math.sin(utils.deg2rad(azimuth)) * ecefCanvasCenter, // flip W-E
                ecefCanvasCenter - Math.cos(utils.deg2rad(azimuth)) * ecefCanvasCenter  // 2D canvas' Y coordinate points down, not up
            ],
            stroke: '#000',
            strokeWidth: 2
        });
        fixLayer.add(azimuthLine);
    }
}

// labels
{
    const labels = [{txt: 'N', deg: 0}, {txt: 'E', deg: Math.PI / 2.0}, {txt: 'S', deg: Math.PI}, {txt: 'W', deg: -Math.PI / 2.0}];
    for (const labelData of labels) {
        const label = new Konva.Text({
            x: ecefCanvasCenter + Math.sin(labelData.deg) * ecefCanvasCenter * 0.97,
            y: ecefCanvasCenter - Math.cos(labelData.deg) * ecefCanvasCenter * 0.97,
            text: labelData.txt,
            fill: '#ccc',
            fontSize: 30
        });
        label.offsetX(label.width() / 2);
        label.offsetY(label.height() / 2);
        fixLayer.add(label);
    }
}

const observerCircle = new Konva.Circle({
    x: ecefCanvasCenter,
    y: ecefCanvasCenter,
    radius: 10,
    fill: '#f0f',
    stroke: '#000',
    strokeWidth: 4
});
fixLayer.add(observerCircle);

ecefStage.add(fixLayer);
ecefStage.add(satLayer);

fixLayer.draw();

function fitStageIntoParentContainer() {
    const containerWidth = document.querySelector('#canvas-sky').clientWidth;
    const containerHeight = document.querySelector('#canvas-sky-container').clientHeight;

    const containerSize = Math.min(containerWidth, containerHeight);
    const scale = containerSize / ECEFCANVASSIZE;

    ecefStage.width(ECEFCANVASSIZE * scale);
    ecefStage.height(ECEFCANVASSIZE * scale);
    ecefStage.scale({ x: scale, y: scale });
}

function scaleValue(value, fromMin, fromMax, toMin, toMax) {
    return toMin + (value - fromMin) * (fromMax - fromMin) * (toMax - toMin);
}

function drawSatellitesOnSky(data) {
    satLayer.destroyChildren();
    data.forEach((satData) => {
        const r = ((90.0 - satData.elev) / 90.0) * (ECEFCANVASSIZE / 2.0);
        const x = ecefCanvasCenter + r * Math.sin(utils.deg2rad(satData.azim));
        const y = ecefCanvasCenter - r * Math.cos(utils.deg2rad(satData.azim));
        const radius = 10;
        const fontSize = 20;
        const color = constellationData[satData.gnssId].color;
        const alpha = scaleValue(satData.cno, 0, 50, 0.2, 1.0);
        const satPoint = new Konva.Circle({
            x: x,
            y: y,
            radius: radius,
            fill: `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`,
            stroke: '#000',
            strokeWidth: 2
        });
        const satLabel = new Konva.Text({
            x: x - radius * 1.5,
            y: y - radius - fontSize,
            text: constellationData[satData.gnssId].prefix + satData.svId,
            fill: '#fff',
            fontSize: fontSize,
            align: 'center'
        })
        satLayer.add(satPoint);
        satLayer.add(satLabel);
    });
}

window.onload = () => {



    fitStageIntoParentContainer();
    // adapt the stage on any window resize
    window.addEventListener('resize', fitStageIntoParentContainer);

    const socket = io();

    console.log("init");

    socket.on('gnss-status', function(data) {
        console.log("new status", data);
        const ctnr = document.getElementById('disp-gnss-status');
        ctnr.innerHTML = data.status;
        if (data.status === 'ok') {
            ctnr.classList.add('text-success');
            ctnr.classList.remove('text-danger');
        } else {
            ctnr.classList.add('text-danger');
            ctnr.classList.remove('text-success');
        }
    });
    socket.on('gnss-data', function(data) {
        console.log("new data", data);
        drawSatellitesOnSky(data.satData);
        document.getElementById('disp-gnss-datatime').innerHTML = new Date().toISOString() + " UTC";
    });

}