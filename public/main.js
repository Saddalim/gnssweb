import * as THREE from 'three';
import { OrbitControls } from 'three/controls/OrbitControls.js';
import * as GNSS from './gnss.js';
//import {Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, ScatterController, Title, Legend, Colors, Tooltip} from 'chart';

//Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, ScatterController, Title, Legend, Colors, Tooltip);

function deg2rad(deg) {
    return deg * Math.PI / 180.0;
}

function rad2deg(rad) {
    return rad * 180.0 / Math.PI;
}

function map_obj(object, fn) {
    const retArray = {};
    for (const [fieldName, fieldValue] of Object.entries(object)) {
        retArray[fieldName] = fn(fieldValue);
    }
    return retArray;
}

/*
const observerAzimuth = { min: deg2rad(170.0), max: deg2rad(260.0) } // [rad] // TODO handle overlap over 0 (north)
const observerElevation = { min: deg2rad(0.0), max: deg2rad(10.0) } // [rad]
*/
// Cesium renderer
/*
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyM2RmZWJlYS1mMTRmLTQ1ZTMtYjY2Ni1lYWFhZGJjZjQyNmYiLCJpZCI6MTM1MDY3LCJpYXQiOjE2ODIxODAxNjV9.xu6N4J0a5GsJ0J1CTidLht72YvlgEjFhJGG7Hfzf940";
const viewer = new Cesium.Viewer('cesiumContainer', {

    terrainProvider: Cesium.createWorldTerrain()

});
*/
// 2D map
// TODO

// 3D renderer

const renderer = new THREE.WebGLRenderer({canvas: document.querySelector('#canvas3d')});
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 100, 100000 );
const controls = new OrbitControls( camera, renderer.domElement );

//renderer.setSize( window.innerWidth, window.innerHeight );
//document.body.appendChild( renderer.domElement );

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

function drawOrbitLine(scene, points, color = 0xffffff) {
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints( points );
    const orbitMaterial = new THREE.LineBasicMaterial({ color: color });
    const line = new THREE.Line( orbitGeometry, orbitMaterial );
    scene.add( line );
}

let satelliteIcons = [];
let satData = null;

function drawSatellite(scene, pos, color = 0xffffff) {
    const satGeometry = new THREE.BufferGeometry();
    satGeometry.setAttribute('position', new THREE.Float32BufferAttribute( [pos.x, pos.y, pos.z], 3));
    const satMaterial = new THREE.PointsMaterial({ color: color, size: 2000.0 });
    const point = new THREE.Points( satGeometry, satMaterial);
    satelliteIcons.push(point);
    scene.add(point);
}

function removeAllSatellites(scene) {
    for (const satelliteIcon of satelliteIcons) {
        scene.remove(satelliteIcon);
    }
    satelliteIcons = [];
}

function updateSatellites(scene, time) {
    removeAllSatellites(scene);
    for (const [constellationId, satellites] of Object.entries(satData.satData)) {
        for (const [satId, epochs] of Object.entries(satellites)) {
            // TODO calculate index from min,max,time instead of iterating/
            for (const [epoch, pos] of Object.entries(epochs)) {
                if (parseInt(epoch) > time)
                {
                    drawSatellite(scene, pos, constellationColors[constellationId]);
                    break;
                }
            }
        }
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


    let visibilityChart = new Chart(
        document.querySelector('#visibility-chart-container'),
        {
            type: 'scatter',
            data: {
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        enabled: true,
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + " : " + new Date(ctx.parsed.x * 1000).toISOString();
                            }
                        }
                    },
                    legend: {
                        display: false
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x'
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            callback: function (val, idx, ticks) {
                                return new Date(val * 1000).toISOString();
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'x'
                }
            },
        }
    );

    let elevationChart = new Chart(
        document.querySelector('#elevation-chart-container'),
        {
            type: 'line',
            data: {
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                parsing: {
                    xAxisKey: 'epoch',
                    yAxisKey: 'epochData.lookAngles.elevation'
                },
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
                        mode: 'nearest'
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x'
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day'
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
                hover: {
                    mode: 'dataset',
                    intersect: false
                }
            },
        }
    );

    let timerSlider = document.querySelector('#timeSelector');
    let calcBtn = document.querySelector('#start-calc-btn');

    calcBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        const formData = new URLSearchParams();
        for (const [configName, configValue] of new FormData(document.querySelector('#observer-form'))) {
            formData.append(configName, configValue);
        }

        console.log(formData);
        fetch('/req', {
            method: 'post',
            body: formData,
        }).then((resp) => {
            resp.json().then((data) => {
                console.log("Got sat data, calculating...");
                satData = data;

                let elevationChartData = [];
                let visibilityTimesPerSat = {};
                let minEpoch = null;
                let maxEpoch = null;
                let observerAzimuth = {min: parseFloat(document.getElementById('input-azim-min').value), max: parseFloat(document.getElementById('input-azim-max').value)};
                let observerElevation = {min: parseFloat(document.getElementById('input-elev-min').value), max: parseFloat(document.getElementById('input-elev-max').value)};

                for (const [constellationId, satellites] of Object.entries(data.satData)) {
                    for (const [satId, epochs] of Object.entries(satellites)) {
                        let chartDataSet = [];
                        const orbitPts = [];
                        for (const [epoch, epochData] of Object.entries(epochs)) {
                            epochData.lookAngles.azimuth = rad2deg(epochData.lookAngles.azimuth);
                            epochData.lookAngles.elevation = rad2deg(epochData.lookAngles.elevation);
                            orbitPts.push(new THREE.Vector3(epochData.pos.x, epochData.pos.y, epochData.pos.z));

                            if (epochData.lookAngles.elevation < 0.0)
                                continue;

                            let epochNum = parseInt(epoch);
                            chartDataSet.push({'epoch': epochNum * 1000, epochData: epochData});
                            if (minEpoch === null || minEpoch > epochNum)
                                minEpoch = epochNum;
                            if (maxEpoch === null || maxEpoch < epochNum)
                                maxEpoch = epochNum;

                            // visibility chart data
                            // TODO handle azimuth overlap over 0 (north)
                            if (epochData.lookAngles.azimuth > observerAzimuth.min && epochData.lookAngles.azimuth < observerAzimuth.max
                                && epochData.lookAngles.elevation > observerElevation.min && epochData.lookAngles.elevation < observerElevation.max) {
                                if (!visibilityTimesPerSat.hasOwnProperty(constellationId + satId))
                                    visibilityTimesPerSat[constellationId + satId] = [];
                                visibilityTimesPerSat[constellationId + satId].push(epochNum);
                            }
                        }
                        // 3d visualization data
                        drawOrbitLine(scene, orbitPts, constellationColors[constellationId]);

                        // elevation chart data
                        elevationChartData.push({label: constellationId + satId, data: chartDataSet});
                    }
                }

                let visibilityChartData = [];
                let satIdx = 0;
                for (const [satIdent, epochs] of Object.entries(visibilityTimesPerSat)) {
                    const colorCode = '#' + constellationColors[satIdent.substring(0, 1)].toString(16).padStart(6, '0');
                    visibilityChartData.push({
                        label: satIdent,
                        data: epochs.map((epoch) => ({x: epoch, y: satIdx})),
                        backgroundColor: colorCode
                    });
                    ++satIdx;
                }

                visibilityChart.data.datasets = visibilityChartData;
                visibilityChart.update();

                elevationChart.data.datasets = elevationChartData;
                elevationChart.update();

                timerSlider.min = minEpoch;
                timerSlider.max = maxEpoch;
                timerSlider.value = minEpoch;
                timerSlider.dispatchEvent(new Event('change'));
            });
        }).catch((err) => {
            console.error(err);
        });
    });


    timerSlider.addEventListener('input', (evt) => {
        const timestamp = parseInt(evt.target.value);
        updateSatellites(scene, timestamp);
        document.querySelector('#timeDisplay').innerHTML = new Date(timestamp * 1000).toISOString();
    });
}
