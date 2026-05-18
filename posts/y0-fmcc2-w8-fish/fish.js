import * as THREE from 'three';

const PERCEPTION_RADIUS = 50;
const MAX_SPEED = 2;
const MAX_FORCE = 0.05;

export class Fish {
    constructor(pos, flockId, texture) {
        this.pos = pos;
        this.vel = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        );
        this.acc = new THREE.Vector3(0, 0, 0);

        this.flockId = flockId;
        
        this.geometry = new THREE.PlaneGeometry(9, 4);
        this.material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.copy(this.pos);
    }

    _neighbours(fishes) {
        // Same flock only
        return fishes.filter(f => f !== this
            && f.flockId === this.flockId
            && this.pos.distanceTo(f.pos) < PERCEPTION_RADIUS);
    }

    _outsiders(fishes) {
        // Different flocks within a larger radius
        return fishes.filter(f => f.flockId !== this.flockId
            && this.pos.distanceTo(f.pos) < PERCEPTION_RADIUS * 1.5);
    }

    alignment(fishes) {
        const neighbours = this._neighbours(fishes);
        if (!neighbours.length) return new THREE.Vector3();

        const steering = new THREE.Vector3();
        neighbours.forEach(f => steering.add(f.vel));
        steering.divideScalar(neighbours.length);
        steering.setLength(MAX_SPEED);
        steering.sub(this.vel);
        steering.clampLength(0, MAX_FORCE);
        return steering;
    }

    cohesion(fishes) {
        const neighbours = this._neighbours(fishes);
        if (!neighbours.length) return new THREE.Vector3();

        const steering = new THREE.Vector3();
        neighbours.forEach(f => steering.add(f.pos));
        steering.divideScalar(neighbours.length);
        steering.sub(this.pos);
        steering.setLength(MAX_SPEED);
        steering.sub(this.vel);
        steering.clampLength(0, MAX_FORCE);
        return steering;
    }

    separation(fishes) {
        const neighbours = this._neighbours(fishes);
        if (!neighbours.length) return new THREE.Vector3();

        const steering = new THREE.Vector3();
        neighbours.forEach(f => {
            const d = this.pos.distanceTo(f.pos);
            const diff = new THREE.Vector3().subVectors(this.pos, f.pos);
            diff.divideScalar(d * d);
            steering.add(diff);
        });
        steering.divideScalar(neighbours.length);
        steering.setLength(MAX_SPEED);
        steering.sub(this.vel);
        steering.clampLength(0, MAX_FORCE);
        return steering;
    }

    avoidOtherFlocks(fishes) {
        const outsiders = this._outsiders(fishes);
        if (!outsiders.length) return new THREE.Vector3();

        const steering = new THREE.Vector3();
        outsiders.forEach(f => {
            const d = this.pos.distanceTo(f.pos);
            const diff = new THREE.Vector3().subVectors(this.pos, f.pos);
            diff.divideScalar(d * d);
            steering.add(diff);
        });
        steering.divideScalar(outsiders.length);
        steering.setLength(MAX_SPEED);
        steering.sub(this.vel);
        steering.clampLength(0, MAX_FORCE * 2);  
        return steering;
    }

    avoidWalls(tankSize) {
        const margin = 50;
        const force = MAX_FORCE * 3;
        const steering = new THREE.Vector3();

        if (this.pos.x < margin) steering.x += force * (1 - this.pos.x / margin);
        if (this.pos.x > tankSize.x - margin) steering.x -= force * (1 - (tankSize.x - this.pos.x) / margin);
        if (this.pos.y < margin) steering.y += force * (1 - this.pos.y / margin);
        if (this.pos.y > tankSize.y - margin) steering.y -= force * (1 - (tankSize.y - this.pos.y) / margin);
        if (this.pos.z < margin) steering.z += force * (1 - this.pos.z / margin);
        if (this.pos.z > tankSize.z - margin) steering.z -= force * (1 - (tankSize.z - this.pos.z) / margin);

        return steering;
    }

    update(fishes, tankSize) {
        const alignment = this.alignment(fishes).multiplyScalar(1.5);
        const cohesion = this.cohesion(fishes).multiplyScalar(1.0);
        const separation = this.separation(fishes).multiplyScalar(1.5);
        const avoidOtherFlocks = this.avoidOtherFlocks(fishes).multiplyScalar(1.6);
        const walls = this.avoidWalls(tankSize);

        this.acc
            .add(alignment)
            .add(cohesion)
            .add(separation)
            .add(avoidOtherFlocks)
            .add(walls);

        this.vel.add(this.acc).clampLength(0, MAX_SPEED);
        this.pos.add(this.vel);
        this.acc.set(0, 0, 0);

        this.mesh.position.copy(this.pos);

        if (this.vel.lengthSq() > 0.0001) {
            const dir = this.vel.clone().normalize();
            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
            this.mesh.setRotationFromQuaternion(quaternion);
        }
    }
}