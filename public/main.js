import * as THREE from 'three';
import { OrbitControls } from 'three/controls/OrbitControls.js';
import * as utils from './utils.js';
import {eci2three, isAngleBetween} from "./utils.js";

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

// =====================================================================================================================
// constants
const ONEDAY = 86400;
const ONEDAYMS = ONEDAY * 1000;
const defaultObserver = {
    lat: 47.4862,
    lon: 19.0560,
    height: 150,
    minAzimuth: 140,
    maxAzimuth: 175,
    minElevation: 0,
    maxElevation: 20
};
const invisibleOrbitOpacity = 0.07;
const invisibleSatOpacity = 0.3;

// DOM elements
let timerSlider = null;
let loadingSplash = null;
let ecefSwitch3d = null;
let cb3dShowOrbits = null;
let cb3dHightlightOrbits = null;

// charts
let visibilityLineChart = null;
let elevationChart = null;

// ECI scene elements
let satelliteIcons = [];
let satelliteOrbitLines = [];
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
    const orbitMaterial = new THREE.LineBasicMaterial({ color: color, transparent: true });
    const line = new THREE.Line( orbitGeometry, orbitMaterial );
    scene.add( line );
    return line;
}

function drawOrbitLines() {
    if (cb3dShowOrbits.checked) {
        if (satelliteOrbitLines.length === 0) {
            satellitePositionData.forEach((positionData, satIdx) => {
                satelliteOrbitLines[satIdx] = drawOrbitLine(eciScene, positionData.data, utils.getColorOfConstellation(positionData.constellationId));
            });
        }
    }
    else
    {
        for (const orbitLine of satelliteOrbitLines) {
            eciScene.remove(orbitLine);
        }
        satelliteOrbitLines = [];
    }
}

function drawSatelliteEci(scene, pos, color = 0xffffff, isVisible = false) {
    const satGeometry = new THREE.BufferGeometry();
    satGeometry.setAttribute('position', new THREE.Float32BufferAttribute( eci2three(pos), 3));
    const satMaterial = new THREE.PointsMaterial({ color: color, transparent: true, opacity: (cb3dHightlightOrbits.checked && !isVisible) ? invisibleSatOpacity : 1.0, size: 2000.0 });
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
        const x = ecefCanvasCenter + r * Math.sin(utils.deg2rad(angles.azimuth));
        const y = ecefCanvasCenter - r * Math.cos(utils.deg2rad(angles.azimuth));
        const radius = 15;
        const fontSize = 30;
        const satPoint = new Konva.Circle({
            x: x,
            y: y,
            radius: radius,
            fill: satData.borderColor,
            stroke: '#000',
            strokeWidth: 2
        });
        const satLabel = new Konva.Text({
            x: x - radius * 1.5,
            y: y - radius - fontSize,
            text: satData.label,
            fill: '#fff',
            fontSize: fontSize,
            align: 'center'
        });
        satLayer.add(satPoint);
        satLayer.add(satLabel);
    }
    satLayer.draw();
}

function drawObserverMarker(scene, time) {

    if (observerMarker !== null)
        scene.remove(observerMarker);

    if (observerPositionData === null)
        return;

    const idx = Math.round((time - minEpoch) / epochStep);

    if (idx < 0 || idx >= observerPositionData.length)
        return;

    const pos = observerPositionData[idx];
    const satGeometry = new THREE.BufferGeometry();
    satGeometry.setAttribute('position', new THREE.Float32BufferAttribute( eci2three(pos), 3));
    const satMaterial = new THREE.PointsMaterial({ color: 0xff00ff, size: 2000.0 });

    const daysToRotate = (time - minEpoch) / ONEDAYMS;
    earth.rotation.y = daysToRotate * Math.PI * 2.0;

    observerMarker = new THREE.Points( satGeometry, satMaterial);
    scene.add(observerMarker);

}

function rotate3dEcefCamera(deltaT) {
    if (deltaT === 0.0)
        return;

    const rotationAngle = Math.PI * 2.0 * (deltaT / ONEDAYMS);
    eciCamera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);
    eciControls.target.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);
}

function removeAllSatellites(scene) {
    for (const satelliteIcon of satelliteIcons) {
        scene.remove(satelliteIcon);
    }
    satelliteIcons = [];
}

function updateSatellites(scene, time) {
    const deltaT = time - lastDrawnSatPosEpoch;

    removeAllSatellites(scene);
    if (ecefSwitch3d.checked)
        rotate3dEcefCamera(deltaT);
    drawObserverMarker(scene, time);

    if (satellitePositionData == null)
        return;

    const idx = Math.round((time - minEpoch) / epochStep);

    if (idx < 0 || idx >= satellitePositionData[0].data.length)
        return;

    satellitePositionData.forEach((satelliteData, satIdx) => {
        const isVisible = visibilityData[satIdx].data[idx].y !== null;
        drawSatelliteEci(scene, satelliteData.data[idx], utils.getColorOfConstellation(satelliteData.constellationId), isVisible);
        const orbitLine = satelliteOrbitLines[satIdx];
        if (orbitLine !== undefined)
            orbitLine.material.opacity = ((cb3dHightlightOrbits.checked && !isVisible) ? invisibleOrbitOpacity : 1.0);
    });
    drawSatellitesEcef(time);

    lastDrawnSatPosEpoch = time;
}

function onChartMouseMove(chart, evt, scene) {
    const canvasPosition = Chart.helpers.getRelativePosition(evt, chart);
    const dataX = chart.scales.x.getValueForPixel(canvasPosition.x);
    updateSatellites(scene, dataX);
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

function setMapAzimuthAngles(marker, min, max) {
    // Leaflet/Semicircle bugs if angle overlaps 0 degrees. Work around by providing minimum azimuth as negative angle
    marker.setStartAngle(isAngleBetween(0, min, max) ? min - 360 : min);
    marker.setStopAngle(max);
}

// =====================================================================================================================

window.onload = (evt) => {

    eciControls.saveState();

    loadingSplash = document.getElementById('loading-overlay');
    ecefSwitch3d = document.getElementById('input-config-3d-fix');
    cb3dShowOrbits = document.getElementById('input-config-3d-show-orbits');
    cb3dHightlightOrbits = document.getElementById('input-config-3d-highlight-orbits');

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
                            major: {
                                enabled: true
                            },
                            font: (ctx) => {
                                return ctx.tick && ctx.tick.major ? { weight: 'bold', color: '#fff' } : {};
                            },
                            color: (ctx) => {
                                return ctx.tick && ctx.tick.major ? '#ccc' : '#666';
                            },
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
                            major: {
                                enabled: true
                            },
                            font: (ctx) => {
                                return ctx.tick && ctx.tick.major ? { weight: 'bold', color: '#fff' } : {};
                            },
                            color: (ctx) => {
                                return ctx.tick && ctx.tick.major ? '#ccc' : '#666';
                            },
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
                }
            }
        }
    );

    visibilityLineChart.canvas.addEventListener('mousemove', (evt) => {
        onChartMouseMove(visibilityLineChart, evt, eciScene);
    });
    elevationChart.canvas.addEventListener('mousemove', (evt) => {
        onChartMouseMove(elevationChart, evt, eciScene);
    });

    timerSlider = document.querySelector('#timeSelector');
    let calcBtn = document.querySelector('#start-calc-btn');

    let map = L.map('map').setView([47.4827, 19.0561], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    let marker = L.marker([defaultObserver.lat, defaultObserver.lon]).addTo(map);
    let azimuthMarker = L.semiCircle([defaultObserver.lat, defaultObserver.lon], {
        radius: 500,
        startAngle: defaultObserver.minAzimuth,
        stopAngle: defaultObserver.maxAzimuth
    }).addTo(map);
    map.on('click', (evt) => {
        marker.setLatLng(evt.latlng);
        azimuthMarker.setLatLng(evt.latlng);
        document.getElementById('input-lat').value = evt.latlng.lat.toFixed(6);
        document.getElementById('input-lon').value = evt.latlng.lng.toFixed(6);
    });

    document.querySelectorAll('.location-input').forEach((input) => {
        input.addEventListener('change', (evt) => {
            const latLon = {
                lat: document.getElementById('input-lat').value,
                lng: document.getElementById('input-lon').value
            };
            azimuthMarker.setLatLng(latLon);
            marker.setLatLng(latLon);
            setMapAzimuthAngles(azimuthMarker, document.getElementById('input-azim-min').value, document.getElementById('input-azim-max').value);
        });
    })

    document.getElementById('input-lat').value = defaultObserver.lat;
    document.getElementById('input-lon').value = defaultObserver.lon;
    document.getElementById('input-height').value = defaultObserver.height;

    document.getElementById('input-elev-min').value = defaultObserver.minElevation;
    document.getElementById('input-elev-max').value = defaultObserver.maxElevation;

    document.getElementById('input-azim-min').value = defaultObserver.minAzimuth;
    document.getElementById('input-azim-max').value = defaultObserver.maxAzimuth;

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

                drawOrbitLines();
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

    document.getElementById('input-btn-reset-3d-cam').addEventListener('click', () => {
        eciControls.reset();
    });

    cb3dShowOrbits.addEventListener('change', () => {
        drawOrbitLines();
        updateSatellites(eciScene, lastDrawnSatPosEpoch);
    });

    cb3dHightlightOrbits.addEventListener('change', () => {
        drawOrbitLines();
        updateSatellites(eciScene, lastDrawnSatPosEpoch);
    })
}

