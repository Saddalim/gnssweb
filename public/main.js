import * as THREE from 'three';
import { OrbitControls } from 'three/controls/OrbitControls.js';
import * as utils from './utils.js';
import {eci2three} from "./utils.js";

// 2D map
// TODO

// 3D renderer

const renderer = new THREE.WebGLRenderer({canvas: document.querySelector('#canvas3d')});
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 100, 100000 );
const controls = new OrbitControls( camera, renderer.domElement );

const light1 = new THREE.HemisphereLight( 0xffffbb, 0x080820, 0.9 );
scene.add( light1 );
const light2 = new THREE.AmbientLight( 0x404040, 0.3 );
scene.add( light2 );

const earthGeometry = new THREE.SphereGeometry(6378.137);
const earthMaterial = new THREE.MeshStandardMaterial( {color: 0x00ff00, wireframe: true });
const earth = new THREE.Mesh( earthGeometry, earthMaterial );
scene.add(earth);

camera.position.set(40000, 20000, 20000);
controls.update();

function resizeCanvasToDisplaySize() {
    const canvas = renderer.domElement;
    // look up the size the canvas is being displayed
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // adjust displayBuffer size to match
    if (canvas.width !== width || canvas.height !== height) {
        // you must pass false here or three.js sadly fights the browser
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        // update any render target sizes here
    }
}

// constants
const ONEDAY = 86400;

// DOM elements
let timerSlider = null;
let loadingSplash = null;

// charts
let visibilityLineChart = null;
let elevationChart = null;

// scene elements
let satelliteIcons = [];
let observerMarker = null;

// sat data
let satellitePositionData = null;
let observerPositionData = null;
let minEpoch = null;
let maxEpoch = null;
let epochStep = null;

let lastDrawnSatPosEpoch = null;

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

function drawSatellite(scene, pos, color = 0xffffff) {
    const satGeometry = new THREE.BufferGeometry();
    satGeometry.setAttribute('position', new THREE.Float32BufferAttribute( eci2three(pos), 3));
    const satMaterial = new THREE.PointsMaterial({ color: color, size: 2000.0 });
    const point = new THREE.Points( satGeometry, satMaterial);
    satelliteIcons.push(point);
    scene.add(point);
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
        drawSatellite(scene, satelliteData.data[idx], utils.getColorStrForConstellationId(satelliteData.constellationId));
    }
}

function setSatellitesTime(scene, time) {
    timerSlider.value = time;
    updateSatellites(scene, time);
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
    resizeCanvasToDisplaySize();
    controls.update();

    renderer.render( scene, camera );
    requestAnimationFrame( animate );
}
animate();

const constellationColors = {
    'G': 0x0000ff, // US
    'R': 0xff0000, // RU
    'E': 0x00ff00, // EU
    'C': 0x00ffff, // CN
    'J': 0xffffff, // JP
    'I': 0xff7f27, // IN
};


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
                            setSatellitesTime(scene, atEpoch);
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
                console.log(observerPositionData);

                timerSlider.min = minEpoch;
                timerSlider.max = maxEpoch;
                timerSlider.value = minEpoch;
                timerSlider.dispatchEvent(new Event('change'));
                document.querySelector('#timeDisplay').innerHTML = moment(minEpoch).format('YYYY-MM-DD HH:mm');

                for (const positionData of data.positionData) {
                    drawOrbitLine(scene, positionData.data, utils.getColorStrForConstellationId(positionData.constellationId));
                }
                updateSatellites(scene, minEpoch);

                console.log("Done");
                hideSplash();
            });
        }).catch((err) => {
            console.error(err);
            hideSplash();
        });

        drawObserverMarker(scene, formData);

    });

    timerSlider.addEventListener('input', (evt) => {
        const timestamp = parseInt(evt.target.value);
        updateSatellites(scene, timestamp);
        document.querySelector('#timeDisplay').innerHTML = moment(timestamp).format('YYYY-MM-DD HH:mm');
    });
}
