import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const renderRatio = 1;
const camera = new THREE.PerspectiveCamera( 90, renderRatio, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
const renderWidth = document.getElementById("threejs_animation").clientWidth
renderer.setSize( renderWidth, renderWidth*renderRatio );
document.getElementById("threejs_animation").appendChild( renderer.domElement );

const radiusMultiplier = 12;

let waves = [];

for(let x = 0; x < 24; x++){
  let geometry = createWaveGeometry( x*radiusMultiplier );
  let material = createWaveMaterial( x*radiusMultiplier );
  let wave = new THREE.Line( geometry, material );

  scene.add( wave )
  waves.push( {obj: wave, radius: x*radiusMultiplier } )
}

camera.position.x = 0.01;
camera.position.y = 0.01;
camera.position.z = 0.01;

function animate( time ) {
  camera.rotateY(0.001);
  
  renderer.render( scene, camera );

  //console.log(`${camera.position.x} ${camera.position.y} ${camera.position.z}`)
}
renderer.setAnimationLoop( animate );

function createWaveGeometry( radius ) {
  let points = [];
  let circleResolution = 0.001;

  for(let angle = 0; angle < 2*Math.PI; angle += circleResolution){
    let freq = 60;
    let amp = 200/radius;
    let period = 0;

    let y = Math.sin(angle * freq + period) * amp;

    let x = radius*Math.cos(angle);
    let z = radius*Math.sin(angle);


    points.push( new THREE.Vector3( x , y , z ) );
  }

  let geometry = new THREE.BufferGeometry().setFromPoints( points );

  return geometry
}

function createWaveMaterial( radius ) {
  let material = new THREE.LineBasicMaterial( { color : `hsl(${radius*0.8}, 100%, 50%)` } );

  return material;
}