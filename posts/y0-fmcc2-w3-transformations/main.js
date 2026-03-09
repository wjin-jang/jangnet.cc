import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const renderRatio = 1;
const camera = new THREE.PerspectiveCamera( 30, renderRatio, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
const renderWidth = document.getElementById("threejs_animation").clientWidth
renderer.setSize( renderWidth, renderWidth*renderRatio );
document.getElementById("threejs_animation").appendChild( renderer.domElement );

const controls = new OrbitControls( camera, renderer.domElement );

//create volumetric grid
const volGridWidth = 16;
const volGridHeight = 16;
const volGridDepth = 16;

const voxelSize = 2;

let volGrid = [];

for(let x = 0; x < volGridWidth; x++){
  for(let y = 0; y < volGridHeight; y++){
    for(let z = 0; z < volGridDepth; z++){
      let points = [];
      let angle = Math.random(6.28);
      //set local geometry to line of length voxelSize
      points.push( new THREE.Vector3( voxelSize*-0.5, 0, 0 ) );
      points.push( new THREE.Vector3( voxelSize*0.5, 0, 0 ) );
      //create line object
      let geometry = new THREE.BufferGeometry().setFromPoints( points );
      let material = new THREE.LineBasicMaterial( { color: 0xffffff } );
      let line = new THREE.Line( geometry, material );
      //apply random rotations in three axis
      line.rotateX(Math.random()*6.28); //6.28 approx 2*PI
      line.rotateY(Math.random()*6.28);
      line.rotateZ(Math.random()*6.28);

      let offsetX = 0.5 * (volGridWidth * voxelSize);
      let offsetY = 0.5 * (volGridHeight * voxelSize);
      let offsetZ = 0.5 * (volGridDepth * voxelSize);

      line.position.set( x * voxelSize - offsetX, y * voxelSize - offsetY, z * voxelSize - offsetZ); //set position to grid
      
      volGrid.push(line); 
      scene.add( line );
    }
  }
}

camera.position.x = 85; //randomly tweaking until showing centred on monitor. not good, probably can be calculated.
camera.position.y = 65;
camera.position.z = 85;
controls.update();

function animate( time ) {
  
  controls.update();
  
  volGrid.forEach( line => { //for all lines
    line.rotateY(0.02); //rotate by 0.2 radians
    line.material.color.set(`hsl(${(line.position.y * 8) + (time / 10)}, 100%, 50%)`) //pulsing hue effect
    //line.rotateY(0.03);
    //line.rotateZ(0.01);

    //console.log(`${camera.position.x},${camera.position.y},${camera.position.z}`)
  });

  renderer.render( scene, camera );
}
renderer.setAnimationLoop( animate );