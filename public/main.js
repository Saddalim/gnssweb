import * as THREE from 'three';
import { OrbitControls } from 'three/controls/OrbitControls.js';
import * as utils from './utils.js';


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

function drawOrbitLine(scene, points, color = 0xffffff) {
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints( points );
    const orbitMaterial = new THREE.LineBasicMaterial({ color: color });
    const line = new THREE.Line( orbitGeometry, orbitMaterial );
    scene.add( line );
}

let satelliteIcons = [];
let positionData = null;
let minEpoch = null;
let maxEpoch = null;
let epochStep = null;

let loadingSplash = null;

function showSplash()
{
    loadingSplash.style.display = 'block';
}

function hideSplash()
{
    loadingSplash.style.display = 'none';
}

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
    const idx = Math.round((time - minEpoch) / epochStep);
    for (const satelliteData of positionData)
    {
        drawSatellite(scene, satelliteData.data[idx], utils.getColorStrForConstellationId(satelliteData.constellationId));
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
                animation: false,
                plugins: {
                    tooltip: {
                        enabled: true,
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + " : " + moment(ctx.parsed.x).format('MM-DD HH:mm');
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
                                return moment(val).format('MM-DD HH:mm');
                            },
                            maxRotation: 70,
                            minRotation: 70
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Satellite idx within given range'
                        },
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
                            displayFormats: {
                                hour: 'HH:mm',
                                minute: 'HH:mm'
                            }
                        },
                        ticks: {
                            sampleSize: 2
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
                interaction: {
                    intersect: false,
                    mode: 'nearest'
                }
            },
        }
    );

    let timerSlider = document.querySelector('#timeSelector');
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
                let visibilityTimesPerSat = data.visibilityData;
                let visibilityChartData = [];
                let satIdx = 0;
                for (const [satIdent, epochs] of Object.entries(visibilityTimesPerSat)) {
                    visibilityChartData.push({
                        label: satIdent,
                        data: epochs.map((epoch) => ({x: epoch, y: satIdx})),
                        backgroundColor: utils.getColorStrForConstellationId(satIdent.substring(0, 1))
                    });
                    ++satIdx;
                }

                minEpoch = visibilityChartData[0].data[0].x;
                maxEpoch = visibilityChartData[0].data.at(-1).x;
                epochStep = visibilityChartData[0].data[1].x - visibilityChartData[0].data[0].x;

                visibilityChart.data.datasets = visibilityChartData;
                visibilityChart.options.scales.x.min = minEpoch;
                visibilityChart.options.scales.x.max = maxEpoch;
                visibilityChart.update();

                elevationChart.options.scales.x.min = minEpoch * 1000;
                elevationChart.options.scales.x.max = maxEpoch * 1000;
                elevationChart.data.datasets = data.elevationData;
                elevationChart.update();

                positionData = data.positionData;

                timerSlider.min = minEpoch;
                timerSlider.max = maxEpoch;
                timerSlider.value = minEpoch;
                timerSlider.dispatchEvent(new Event('change'));

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
    });

    timerSlider.addEventListener('input', (evt) => {
        const timestamp = parseInt(evt.target.value);
        updateSatellites(scene, timestamp);
        document.querySelector('#timeDisplay').innerHTML = new Date(timestamp * 1000).toISOString();
    });
}
