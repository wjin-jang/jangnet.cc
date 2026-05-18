import { Fish } from './fish.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const renderRatio = 1;
const camera = new THREE.PerspectiveCamera(15, renderRatio, 0.1, 8000);
const renderer = new THREE.WebGLRenderer();
const renderWidth = document.getElementById("threejs_animation").clientWidth;
renderer.setSize(renderWidth, renderWidth * renderRatio);
document.getElementById("threejs_animation").appendChild(renderer.domElement);

//const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(800, 600, 800);
camera.lookAt(200, 200, 200);

const TANK_SIZE = new THREE.Vector3(400, 400, 400);
const margin = 50;

const loader = new THREE.TextureLoader();

const FLOCKS = [
    { sprite: './assets/fish.png', count: 80 },
    { sprite: './assets/goldfish.png', count: 80 },
    { sprite: './assets/longfish.png', count: 80 },
];

let allFish = [];

FLOCKS.forEach((def, flockId) => {
    const texture = loader.load(def.sprite);
    texture.colorSpace = THREE.SRGBColorSpace;

    for (let i = 0; i < def.count; i++) {
        const pos = new THREE.Vector3(
            margin + Math.random() * (TANK_SIZE.x - margin * 2),
            margin + Math.random() * (TANK_SIZE.y - margin * 2),
            margin + Math.random() * (TANK_SIZE.z - margin * 2),
        );
        const fish = new Fish(pos, flockId, texture);
        allFish.push(fish);
        scene.add(fish.mesh);
    }
});

function createGradientBackground(stops) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 256;

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);

    stops.forEach(stop => {
        gradient.addColorStop(stop.position, stop.color);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    
    return texture;
}

scene.background = createGradientBackground([
    { color: '#161619', position: 0.0 },
    { color: '#455CAF', position: 0.7 },
    { color: '#858A72', position: 0.8 },
    { color: '#EBF4F5', position: 1.0 },
]);

function animate() {
    allFish.forEach(fish => fish.update(allFish, TANK_SIZE));
    //controls.update();
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);