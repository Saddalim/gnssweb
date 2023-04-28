import * as THREE from 'three';
import { OrbitControls } from 'three/controls/OrbitControls.js';
import * as utils from './utils.js';
import {eci2three} from "./utils.js";

// =====================================================================================================================
// 3D renderer (ECI frame)

const eciRenderer = new THREE.WebGLRenderer({canvas: document.querySelector('#canvas-eci'), alpha: true});
const eciScene = new THREE.Scene();
const eciCamera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 100, 150000 );
const eciControls = new OrbitControls( eciCamera, eciRenderer.domElement );

const light1 = new THREE.HemisphereLight( 0xffffbb, 0x080820, 0.9 );
eciScene.add( light1 );
const light2 = new THREE.AmbientLight( 0x404040, 0.3 );
eciScene.add( light2 );

const earthGeometry = new THREE.SphereGeometry(6378.137);
const earthMaterial = new THREE.MeshStandardMaterial( {color: 0x00ff00, wireframe: true });
const earth = new THREE.Mesh( earthGeometry, earthMaterial );
eciScene.add(earth);

eciCamera.position.set(45000, 25000, 25000);
eciControls.update();

// =====================================================================================================================
// 2D renderer (ECEF frame)

const ECEFCANVASSIZE = 1000;
const ecefCanvasCenter = ECEFCANVASSIZE / 2;

const ecefStage = new Konva.Stage({
    container: 'canvas-ecef',
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
    const labels = [{txt: 'N', deg: 0}, {txt: 'W', deg: Math.PI / 2.0}, {txt: 'S', deg: Math.PI}, {txt: 'E', deg: -Math.PI / 2.0}];
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

// =====================================================================================================================
// constants
const ONEDAY = 86400;

// DOM elements
let timerSlider = null;
let loadingSplash = null;

// charts
let visibilityLineChart = null;
let elevationChart = null;

// ECI scene elements
let satelliteIcons = [];
let observerMarker = null;

// sat data
let satellitePositionData = null;
let observerPositionData = null;
let visibilityData = null;
let minEpoch = null;
let maxEpoch = null;
let epochStep = null;

let lastDrawnSatPosEpoch = null;

// =====================================================================================================================
// responsivity
function resizeCanvasToDisplaySize(canvas) {
    //const canvas = eciRenderer.domElement;
    // look up the size the canvas is being displayed
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // adjust displayBuffer size to match
    if (canvas.width !== width || canvas.height !== height) {
        // you must pass false here or three.js sadly fights the browser
        eciRenderer.setSize(width, height, false);
        eciCamera.aspect = width / height;
        eciCamera.updateProjectionMatrix();

        // update any render target sizes here
    }
}

function fitStageIntoParentContainer() {
    const containerWidth = document.querySelector('#canvas-ecef').clientWidth;
    const containerHeight = document.querySelector('#canvas-ecef-container').clientHeight;

    const containerSize = Math.min(containerWidth, containerHeight);
    const scale = containerSize / ECEFCANVASSIZE;

    ecefStage.width(ECEFCANVASSIZE * scale);
    ecefStage.height(ECEFCANVASSIZE * scale);
    ecefStage.scale({ x: scale, y: scale });
}

fitStageIntoParentContainer();
// adapt the stage on any window resize
window.addEventListener('resize', fitStageIntoParentContainer);

// =====================================================================================================================

function showSplash()
{
    loadingSplash.style.display = 'block';
}

function hideSplash()
{
    loadingSplash.style.display = 'none';
}

function drawOrbitLine(scene, points, color = 0xffffff) {
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints( points.map((pt) => eci2three(pt, false)) );
    const orbitMaterial = new THREE.LineBasicMaterial({ color: color });
    const line = new THREE.Line( orbitGeometry, orbitMaterial );
    scene.add( line );
}

function drawSatelliteEci(scene, pos, color = 0xffffff) {
    const satGeometry = new THREE.BufferGeometry();
    satGeometry.setAttribute('position', new THREE.Float32BufferAttribute( eci2three(pos), 3));
    const satMaterial = new THREE.PointsMaterial({ color: color, size: 2000.0 });
    const point = new THREE.Points( satGeometry, satMaterial);
    satelliteIcons.push(point);
    scene.add(point);
}

function drawSatellitesEcef(time) {
    // TODO cache shapes
    satLayer.destroyChildren();
    const idx = Math.round((time - minEpoch) / epochStep);
    for (const satData of visibilityData) {

        const angles = satData.data[idx];

        // TODO handle satellites below 0 elevation (might be visible from a high elevation)
        if (! angles.hasOwnProperty('elevation') || angles.elevation < 0.0)
            continue;

        const r = ((90.0 - angles.elevation) / 90.0) * (ECEFCANVASSIZE / 2.0);
        const satPoint = new Konva.Circle({
            x: ecefCanvasCenter - r * Math.sin(utils.deg2rad(angles.azimuth)), // flip W-E
            y: ecefCanvasCenter - r * Math.cos(utils.deg2rad(angles.azimuth)),
            radius: 5,
            fill: satData.borderColor,
            stroke: '#000',
            strokeWidth: 2
        });
        satLayer.add(satPoint);
    }
    satLayer.draw();
}

function drawObserverMarker(scene, time) {

    if (observerMarker !== null)
        scene.remove(observerMarker);

    if (observerPositionData === null)
        return;

    const idx = Math.round((time - minEpoch) / epochStep);
    const pos = observerPositionData[idx];
    const satGeometry = new THREE.BufferGeometry();
    satGeometry.setAttribute('position', new THREE.Float32BufferAttribute( eci2three(pos), 3));
    const satMaterial = new THREE.PointsMaterial({ color: 0xff00ff, size: 2000.0 });

    const daysToRotate = (time - minEpoch) / ONEDAY / 1000.0;
    earth.rotation.y = daysToRotate * Math.PI * 2.0;

    observerMarker = new THREE.Points( satGeometry, satMaterial);
    scene.add(observerMarker);

}

function removeAllSatellites(scene) {
    for (const satelliteIcon of satelliteIcons) {
        scene.remove(satelliteIcon);
    }
    satelliteIcons = [];
}

function updateSatellites(scene, time) {
    removeAllSatellites(scene);
    drawObserverMarker(scene, time);
    const idx = Math.round((time - minEpoch) / epochStep);
    for (const satelliteData of satellitePositionData)
    {
        drawSatelliteEci(scene, satelliteData.data[idx], utils.getColorStrForConstellationId(satelliteData.constellationId));
    }
    drawSatellitesEcef(time);
}

function setSatellitesTime(scene, time) {
    timerSlider.value = time;
    timerSlider.dispatchEvent(new Event('input'));
}

function syncCharts(source) {
    let min = source.chart.scales.x.min;
    let max = source.chart.scales.x.max;

    if (source.chart === visibilityLineChart)
    {
        elevationChart.options.scales.x.min = min;
        elevationChart.options.scales.x.max = max;
        elevationChart.update();
    }
    else
    {
        visibilityLineChart.options.scales.x.min = min;
        visibilityLineChart.options.scales.x.max = max;
        visibilityLineChart.update();
    }
}

function animate() {
    resizeCanvasToDisplaySize(eciRenderer.domElement);
    eciControls.update();

    eciRenderer.render( eciScene, eciCamera );
    requestAnimationFrame( animate );
}
animate();

// =====================================================================================================================

window.onload = (evt) => {

    loadingSplash = document.getElementById('loading-overlay');

    visibilityLineChart = new Chart(
        document.querySelector('#visibility-line-chart-container'),
        {
            type: 'line',
            data: {
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                parsing: false,
                normalized: true,
                snapGaps: true,
                elements: {
                    point: {
                        radius: 0
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ': ' + ctx.raw.elevation.toFixed(1) + '@' + ctx.raw.azimuth.toFixed(1);
                            }
                        }
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x',
                            onPan: syncCharts
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                            onZoom: syncCharts
                        },
                    },
                    crosshair: {
                        sync: {
                            enabled: true
                        },
                        zoom: {
                            enabled: false
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                hour: 'HH:mm',
                                minute: 'HH:mm'
                            }
                        },
                        ticks: {
                            sampleSize: 2,
                            minRotation: 0,
                            maxRotation: 0
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Visibility [idx]'
                        },
                        min: 0,
                        max: 90.0
                    }
                },
            },
        }
    );

    elevationChart = new Chart(
        document.querySelector('#elevation-chart-container'),
        {
            type: 'line',
            data: {
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                parsing: false,
                normalized: true,
                snapGaps: false,

                elements: {
                    point: {
                        radius: 0
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        /*enabled: true,*/
                        mode: "index",
                        intersect: false,
                        itemSort: (a, b) => b.raw.y - a.raw.y
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x',
                            onPan: syncCharts
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                            onZoom: syncCharts
                        }
                    },
                    crosshair: {
                        sync: {
                            enabled: true
                        },
                        zoom: {
                            enabled: false
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                hour: 'HH:mm',
                                minute: 'HH:mm'
                            }
                        },
                        ticks: {
                            sampleSize: 2,
                            minRotation: 0,
                            maxRotation: 0
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Elevation [°]'
                        },
                        min: 0,
                        max: 90.0
                    }
                },
            },
            plugins: [{
                id: 'globeDisplayer',
                afterDatasetsDraw(chart, args, pluginOptions) {

                },
                beforeTooltipDraw(chart, args, options) {
                    if (args.tooltip.dataPoints.length > 0)
                    {
                        const atEpoch = args.tooltip.dataPoints[0].parsed.x;
                        if (atEpoch !== lastDrawnSatPosEpoch)
                        {
                            lastDrawnSatPosEpoch = atEpoch;
                            setSatellitesTime(eciScene, atEpoch);
                        }
                    }
                }
            }]
        }
    );

    timerSlider = document.querySelector('#timeSelector');
    let calcBtn = document.querySelector('#start-calc-btn');

    calcBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        showSplash();
        const formData = new URLSearchParams();
        for (const [configName, configValue] of new FormData(document.querySelector('#observer-form'))) {
            formData.append(configName, configValue);
        }

        console.log("Requesting sat data...");
        fetch('/req', {
            method: 'post',
            body: formData,
        }).then((resp) => {
            resp.json().then((data) => {
                console.log("Got sat data, drawing...");

                minEpoch = data.visibilityLineData[0].data[0].x;
                maxEpoch = data.visibilityLineData[0].data.at(-1).x;
                epochStep = data.visibilityLineData[0].data[1].x - data.visibilityLineData[0].data[0].x;

                visibilityLineChart.data.datasets = data.visibilityLineData;
                visibilityLineChart.options.scales.x.min = minEpoch;
                visibilityLineChart.options.scales.x.max = maxEpoch;
                visibilityLineChart.options.scales.y.max = data.visibilityLineData.length + 1; // +1 so that there is a buffer for the line width
                visibilityLineChart.update();

                elevationChart.options.scales.x.min = minEpoch;
                elevationChart.options.scales.x.max = maxEpoch;
                elevationChart.data.datasets = data.elevationData;
                elevationChart.update();

                satellitePositionData = data.positionData;
                observerPositionData = data.observerPositionData;
                visibilityData = data.visibilityLineData;

                timerSlider.min = minEpoch;
                timerSlider.max = maxEpoch;
                timerSlider.value = minEpoch;
                timerSlider.dispatchEvent(new Event('input'));
                document.querySelector('#timeDisplay').innerHTML = moment(minEpoch).format('YYYY-MM-DD HH:mm');

                for (const positionData of data.positionData) {
                    drawOrbitLine(eciScene, positionData.data, utils.getColorStrForConstellationId(positionData.constellationId));
                }
                updateSatellites(eciScene, minEpoch);

                console.log("Done");
                hideSplash();
            });
        }).catch((err) => {
            console.error(err);
            hideSplash();
        });

        drawObserverMarker(eciScene, formData);

    });

    timerSlider.addEventListener('input', (evt) => {
        const timestamp = parseInt(evt.target.value);
        updateSatellites(eciScene, timestamp);
        document.querySelector('#timeDisplay').innerHTML = moment(timestamp).format('YYYY-MM-DD HH:mm');
    });
}
