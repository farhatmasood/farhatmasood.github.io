/**
 * Physics Engine — Real Newtonian mechanics.
 * 
 * Semi-implicit Euler integration, impulse-based collision response,
 * Coulomb friction, spring constraints, air drag.
 */
import { Vec2 } from './vector.js';

// ─── Shape Types ─────────────────────────────────────────────
export const Shape = {
    CIRCLE: 'circle',
    RECT: 'rect',
};

// ─── Unique ID counter ─────────────────────────────────────
let _nextId = 0;

// ─── Body ────────────────────────────────────────────────────
export class Body {
    constructor(opts = {}) {
        this.id = _nextId++;
        this.position = opts.position || Vec2.zero();
        this.velocity = opts.velocity || Vec2.zero();
        this.acceleration = Vec2.zero();
        this.force = Vec2.zero();

        this.mass = opts.mass !== undefined ? opts.mass : 1;
        this.invMass = this.mass > 0 ? 1 / this.mass : 0;
        this.isStatic = opts.isStatic || this.mass === 0;
        if (this.isStatic) {
            this.mass = 0;
            this.invMass = 0;
        }

        this.shape = opts.shape || Shape.CIRCLE;
        this.radius = opts.radius || 20;
        this.width = opts.width || 40;
        this.height = opts.height || 40;

        this.angle = opts.angle || 0;
        this.angularVelocity = opts.angularVelocity || 0;
        this.torque = 0;
        
        if (this.isStatic) {
            this.inertia = 0;
            this.invInertia = 0;
        } else {
            if (this.shape === Shape.CIRCLE) {
                this.inertia = 0.5 * this.mass * this.radius * this.radius;
            } else {
                this.inertia = (1 / 12) * this.mass * (this.width * this.width + this.height * this.height);
            }
            this.invInertia = 1 / this.inertia;
        }

        this.restitution = opts.restitution !== undefined ? opts.restitution : 0.5;
        this.friction = opts.friction !== undefined ? opts.friction : 0.3;

        this.color = opts.color || '#4fc3f7';
        this.label = opts.label || '';

        this.trail = [];
        this.maxTrailLength = 200;
    }

    applyForce(f) {
        this.force = this.force.add(f);
    }

    applyForceAtOffset(f, offset) {
        this.force = this.force.add(f);
        this.torque += offset.cross(f);
    }

    applyTorque(t) {
        this.torque += t;
    }

    applyImpulse(j) {
        if (this.isStatic) return;
        this.velocity = this.velocity.add(j.scale(this.invMass));
    }

    applyImpulseAtOffset(j, offset) {
        if (this.isStatic) return;
        this.velocity = this.velocity.add(j.scale(this.invMass));
        this.angularVelocity += offset.cross(j) * this.invInertia;
    }

    applyAngularImpulse(angularImpulse) {
        if (this.isStatic) return;
        this.angularVelocity += angularImpulse * this.invInertia;
    }

    kineticEnergy() {
        if (this.isStatic) return 0;
        const translational = 0.5 * this.mass * this.velocity.lengthSq();
        const rotational = 0.5 * this.inertia * this.angularVelocity * this.angularVelocity;
        return translational + rotational;
    }

    potentialEnergy(gravity, refY) {
        if (this.isStatic) return 0;
        const height = refY - this.position.y;
        return this.mass * Math.abs(gravity) * height;
    }

    speed() {
        return this.velocity.length();
    }

    momentum() {
        return this.velocity.scale(this.mass);
    }

    recordTrail() {
        this.trail.push(this.position.clone());
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
    }

    aabb() {
        if (this.shape === Shape.CIRCLE) {
            return {
                minX: this.position.x - this.radius,
                minY: this.position.y - this.radius,
                maxX: this.position.x + this.radius,
                maxY: this.position.y + this.radius,
            };
        } else {
            const hw = this.width / 2;
            const hh = this.height / 2;
            const cos = Math.abs(Math.cos(this.angle));
            const sin = Math.abs(Math.sin(this.angle));
            const boundW = hw * cos + hh * sin;
            const boundH = hw * sin + hh * cos;
            return {
                minX: this.position.x - boundW,
                minY: this.position.y - boundH,
                maxX: this.position.x + boundW,
                maxY: this.position.y + boundH,
            };
        }
    }

    getVertices() {
        if (this.shape === Shape.CIRCLE) return [];
        const hw = this.width / 2;
        const hh = this.height / 2;
        const pts = [
            new Vec2(-hw, -hh),
            new Vec2(hw, -hh),
            new Vec2(hw, hh),
            new Vec2(-hw, hh)
        ];
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        return pts.map(p => new Vec2(
            this.position.x + (p.x * cos - p.y * sin),
            this.position.y + (p.x * sin + p.y * cos)
        ));
    }

    getAxes() {
        if (this.shape === Shape.CIRCLE) return [];
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        return [
            new Vec2(cos, sin),
            new Vec2(-sin, cos)
        ];
    }
}

// ─── Spring Constraint (Hooke's Law) ─────────────────────────
export class Spring {
    constructor(bodyA, bodyB, restLength, stiffness = 50, damping = 1) {
        this.bodyA = bodyA;
        this.bodyB = bodyB;
        this.restLength = restLength;
        this.stiffness = stiffness;
        this.damping = damping;
    }

    apply() {
        const pA = this.bodyA.position;
        const pB = this.bodyB.position;

        const delta = pB.sub(pA);
        const dist = delta.length();
        if (dist === 0) return;

        const dir = delta.normalize();
        const stretch = dist - this.restLength;
        const springForce = dir.scale(this.stiffness * stretch);

        const relVel = this.bodyB.velocity.sub(this.bodyA.velocity);
        const dampingForce = dir.scale(this.damping * relVel.dot(dir));

        const totalForce = springForce.add(dampingForce);

        this.bodyA.applyForce(totalForce);
        this.bodyB.applyForce(totalForce.neg());
    }
}

// ─── Rigid Constraints (Joints) ───────────────────────────────

export class DistanceJoint {
    constructor(bodyA, bodyB, localAnchorA = Vec2.zero(), localAnchorB = Vec2.zero()) {
        this.bodyA = bodyA;
        this.bodyB = bodyB;
        this.localAnchorA = localAnchorA;
        this.localAnchorB = localAnchorB;
        
        const pA = this.getWorldAnchorA();
        const pB = this.getWorldAnchorB();
        this.restLength = pB.sub(pA).length();
    }

    getWorldAnchorA() {
        const cos = Math.cos(this.bodyA.angle);
        const sin = Math.sin(this.bodyA.angle);
        return this.bodyA.position.add(new Vec2(
            this.localAnchorA.x * cos - this.localAnchorA.y * sin,
            this.localAnchorA.x * sin + this.localAnchorA.y * cos
        ));
    }

    getWorldAnchorB() {
        const cos = Math.cos(this.bodyB.angle);
        const sin = Math.sin(this.bodyB.angle);
        return this.bodyB.position.add(new Vec2(
            this.localAnchorB.x * cos - this.localAnchorB.y * sin,
            this.localAnchorB.x * sin + this.localAnchorB.y * cos
        ));
    }

    applyPositional() {
        const pA = this.getWorldAnchorA();
        const pB = this.getWorldAnchorB();
        const delta = pB.sub(pA);
        const dist = delta.length();
        if (dist === 0) return;

        const err = dist - this.restLength;
        const dir = delta.normalize();
        
        const invMassA = this.bodyA.invMass;
        const invMassB = this.bodyB.invMass;
        const totalInvMass = invMassA + invMassB;
        if (totalInvMass === 0) return;

        const correction = dir.scale(err * 0.5);

        if (!this.bodyA.isStatic) this.bodyA.position = this.bodyA.position.add(correction.scale(invMassA / totalInvMass));
        if (!this.bodyB.isStatic) this.bodyB.position = this.bodyB.position.sub(correction.scale(invMassB / totalInvMass));
    }
}

export class RevoluteJoint {
    constructor(bodyA, bodyB, anchorWorld) {
        this.bodyA = bodyA;
        this.bodyB = bodyB;
        
        const cosA = Math.cos(-bodyA.angle);
        const sinA = Math.sin(-bodyA.angle);
        const relA = anchorWorld.sub(bodyA.position);
        this.localAnchorA = new Vec2(
            relA.x * cosA - relA.y * sinA,
            relA.x * sinA + relA.y * cosA
        );

        const cosB = Math.cos(-bodyB.angle);
        const sinB = Math.sin(-bodyB.angle);
        const relB = anchorWorld.sub(bodyB.position);
        this.localAnchorB = new Vec2(
            relB.x * cosB - relB.y * sinB,
            relB.x * sinB + relB.y * cosB
        );
    }

    getWorldAnchorA() {
        const cos = Math.cos(this.bodyA.angle);
        const sin = Math.sin(this.bodyA.angle);
        return this.bodyA.position.add(new Vec2(
            this.localAnchorA.x * cos - this.localAnchorA.y * sin,
            this.localAnchorA.x * sin + this.localAnchorA.y * cos
        ));
    }

    getWorldAnchorB() {
        const cos = Math.cos(this.bodyB.angle);
        const sin = Math.sin(this.bodyB.angle);
        return this.bodyB.position.add(new Vec2(
            this.localAnchorB.x * cos - this.localAnchorB.y * sin,
            this.localAnchorB.x * sin + this.localAnchorB.y * cos
        ));
    }

    applyPositional() {
        const pA = this.getWorldAnchorA();
        const pB = this.getWorldAnchorB();
        const err = pB.sub(pA);
        
        const invMassA = this.bodyA.invMass;
        const invMassB = this.bodyB.invMass;
        const totalInvMass = invMassA + invMassB;
        if (totalInvMass === 0) return;

        const correction = err.scale(0.5);

        if (!this.bodyA.isStatic) this.bodyA.position = this.bodyA.position.add(correction.scale(invMassA / totalInvMass));
        if (!this.bodyB.isStatic) this.bodyB.position = this.bodyB.position.sub(correction.scale(invMassB / totalInvMass));
    }
}

// ─── Collision Contact ────────────────────────────────────────
class Contact {
    constructor(bodyA, bodyB, normal, depth, contactPoints = []) {
        this.bodyA = bodyA;
        this.bodyB = bodyB;
        this.normal = normal;
        this.depth = depth;
        this.points = contactPoints;
    }
}

// ─── World ────────────────────────────────────────────────────
export class World {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.bodies = [];
        this.springs = [];
        this.joints = [];

        this.gravity = new Vec2(0, 9.81 * 60);
        this.airDrag = 0.001;
        this.timeScale = 1.0;

        this.substeps = 4;

        this.wallRestitution = 0.5;
        this.wallFriction = 0.4;

        this.totalKE = 0;
        this.totalPE = 0;
        this.totalEnergy = 0;
        this.totalMomentum = Vec2.zero();
    }

    addBody(body) {
        this.bodies.push(body);
        return body;
    }

    removeBody(body) {
        const idx = this.bodies.indexOf(body);
        if (idx !== -1) this.bodies.splice(idx, 1);
        this.springs = this.springs.filter(s => s.bodyA !== body && s.bodyB !== body);
        this.joints = this.joints.filter(j => j.bodyA !== body && j.bodyB !== body);
    }

    addSpring(spring) {
        this.springs.push(spring);
        return spring;
    }

    addJoint(joint) {
        this.joints.push(joint);
        return joint;
    }

    clear() {
        this.bodies = [];
        this.springs = [];
        this.joints = [];
    }

    step(dt) {
        const scaledDt = dt * this.timeScale;
        const subDt = scaledDt / this.substeps;

        for (let s = 0; s < this.substeps; s++) {
            this._applyForces();
            this._applySprings();
            this._integrate(subDt);
            
            for (let i = 0; i < 3; i++) {
                this._applyJoints();
                this._detectAndResolveCollisions();
                this._enforceWalls();
            }
            this._clearForces();
        }

        this.totalKE = 0;
        this.totalPE = 0;
        this.totalMomentum = Vec2.zero();

        for (const body of this.bodies) {
            body.recordTrail();
            this.totalKE += body.kineticEnergy();
            this.totalPE += body.potentialEnergy(this.gravity.y / 60, this.height);
            this.totalMomentum = this.totalMomentum.add(body.momentum());
        }
        this.totalEnergy = this.totalKE + this.totalPE;
    }

    _applyForces() {
        for (const body of this.bodies) {
            if (body.isStatic) continue;

            body.applyForce(this.gravity.scale(body.mass));

            if (this.airDrag > 0) {
                const dragForce = body.velocity.scale(-this.airDrag * body.mass);
                body.applyForce(dragForce);
                
                const angularDrag = -this.airDrag * body.inertia * body.angularVelocity * 0.5;
                body.applyTorque(angularDrag);
            }
        }
    }

    _applySprings() {
        for (const spring of this.springs) {
            spring.apply();
        }
    }

    _applyJoints() {
        for (const joint of this.joints) {
            joint.applyPositional();
        }
    }

    _integrate(dt) {
        for (const body of this.bodies) {
            if (body.isStatic) continue;

            const acc = body.force.scale(body.invMass);
            const alpha = body.torque * body.invInertia;

            body.velocity = body.velocity.add(acc.scale(dt));
            body.position = body.position.add(body.velocity.scale(dt));
            
            body.angularVelocity += alpha * dt;
            body.angle += body.angularVelocity * dt;
        }
    }

    _clearForces() {
        for (const body of this.bodies) {
            body.force = Vec2.zero();
            body.torque = 0;
        }
    }

    _detectAndResolveCollisions() {
        const contacts = [];

        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const a = this.bodies[i];
                const b = this.bodies[j];

                if (a.isStatic && b.isStatic) continue;

                const contact = this._narrowPhase(a, b);
                if (contact) contacts.push(contact);
            }
        }

        for (const c of contacts) {
            this._resolveContact(c);
        }
    }

    _narrowPhase(a, b) {
        if (a.shape === Shape.CIRCLE && b.shape === Shape.CIRCLE) {
            return this._circleVsCircle(a, b);
        }
        if (a.shape === Shape.RECT && b.shape === Shape.RECT) {
            return this._rectVsRect(a, b);
        }
        if (a.shape === Shape.CIRCLE && b.shape === Shape.RECT) {
            return this._circleVsRect(a, b);
        }
        if (a.shape === Shape.RECT && b.shape === Shape.CIRCLE) {
            const c = this._circleVsRect(b, a);
            if (c) {
                c.bodyA = a;
                c.bodyB = b;
                c.normal = c.normal.neg();
            }
            return c;
        }
        return null;
    }

    _circleVsCircle(a, b) {
        const diff = b.position.sub(a.position);
        const dist = diff.length();
        const minDist = a.radius + b.radius;

        if (dist >= minDist || dist === 0) return null;

        const normal = diff.normalize();
        const depth = minDist - dist;
        
        const point = a.position.add(normal.scale(a.radius - depth * 0.5));

        return new Contact(a, b, normal, depth, [point]);
    }

    _rectVsRect(a, b) {
        const aVerts = a.getVertices();
        const bVerts = b.getVertices();
        const axes = [...a.getAxes(), ...b.getAxes()];

        let minDepth = Infinity;
        let bestAxis = null;

        for (const axis of axes) {
            let minA = Infinity, maxA = -Infinity;
            for (const v of aVerts) {
                const proj = v.dot(axis);
                if (proj < minA) minA = proj;
                if (proj > maxA) maxA = proj;
            }

            let minB = Infinity, maxB = -Infinity;
            for (const v of bVerts) {
                const proj = v.dot(axis);
                if (proj < minB) minB = proj;
                if (proj > maxB) maxB = proj;
            }

            if (minA >= maxB || minB >= maxA) {
                return null;
            }

            const depth = Math.min(maxA - minB, maxB - minA);
            if (depth < minDepth) {
                minDepth = depth;
                bestAxis = axis;
            }
        }

        const dir = b.position.sub(a.position);
        if (dir.dot(bestAxis) < 0) {
            bestAxis = bestAxis.neg();
        }
        
        let contactPoint = null;
        let maxPen = -Infinity;
        for (const v of bVerts) {
            const rel = v.sub(a.position);
            const pen = -rel.dot(bestAxis);
            if (pen > maxPen) { maxPen = pen; contactPoint = v; }
        }
        for (const v of aVerts) {
            const rel = v.sub(b.position);
            const pen = rel.dot(bestAxis);
            if (pen > maxPen) { maxPen = pen; contactPoint = v; }
        }

        if (!contactPoint) {
            contactPoint = a.position.add(b.position).scale(0.5);
        }

        return new Contact(a, b, bestAxis, minDepth, [contactPoint]);
    }

    _circleVsRect(circle, rect) {
        const cos = Math.cos(-rect.angle);
        const sin = Math.sin(-rect.angle);
        const relOrigin = circle.position.sub(rect.position);
        const localCirclePos = new Vec2(
            relOrigin.x * cos - relOrigin.y * sin,
            relOrigin.x * sin + relOrigin.y * cos
        );

        const hw = rect.width / 2;
        const hh = rect.height / 2;

        const clampedX = Math.max(-hw, Math.min(hw, localCirclePos.x));
        const clampedY = Math.max(-hh, Math.min(hh, localCirclePos.y));

        const localClosest = new Vec2(clampedX, clampedY);
        const diff = localCirclePos.sub(localClosest);
        const distSq = diff.lengthSq();

        if (distSq >= circle.radius * circle.radius || distSq === 0) return null;

        const dist = Math.sqrt(distSq);
        const localNormal = diff.scale(1 / dist);
        const depth = circle.radius - dist;

        const wCos = Math.cos(rect.angle);
        const wSin = Math.sin(rect.angle);
        const normal = new Vec2(
            localNormal.x * wCos - localNormal.y * wSin,
            localNormal.x * wSin + localNormal.y * wCos
        );
        
        const worldClosest = new Vec2(
            localClosest.x * wCos - localClosest.y * wSin,
            localClosest.x * wSin + localClosest.y * wCos
        ).add(rect.position);

        return new Contact(circle, rect, normal, depth, [worldClosest]);
    }

    _resolveContact(contact) {
        const { bodyA, bodyB, normal, depth, points } = contact;
        if (!points || points.length === 0) return;

        const percent = 0.8;
        const slop = 0.5;
        const totalInvMass = bodyA.invMass + bodyB.invMass;
        if (totalInvMass === 0) return;

        const correction = normal.scale(
            (Math.max(depth - slop, 0) / totalInvMass) * percent
        );
        bodyA.position = bodyA.position.sub(correction.scale(bodyA.invMass));
        bodyB.position = bodyB.position.add(correction.scale(bodyB.invMass));

        const point = points[0];
        const rA = point.sub(bodyA.position);
        const rB = point.sub(bodyB.position);

        const vA = bodyA.velocity.add(new Vec2(-bodyA.angularVelocity * rA.y, bodyA.angularVelocity * rA.x));
        const vB = bodyB.velocity.add(new Vec2(-bodyB.angularVelocity * rB.y, bodyB.angularVelocity * rB.x));
        const vRel = vB.sub(vA);

        const velAlongNormal = vRel.dot(normal);
        if (velAlongNormal > 0) return;

        const e = Math.min(bodyA.restitution, bodyB.restitution);
        
        const rACrossN = rA.cross(normal);
        const rBCrossN = rB.cross(normal);
        
        let invMassSum = bodyA.invMass + bodyB.invMass 
                       + (rACrossN * rACrossN) * bodyA.invInertia 
                       + (rBCrossN * rBCrossN) * bodyB.invInertia;

        let j = -(1 + e) * velAlongNormal / invMassSum;
        const impulse = normal.scale(j);

        bodyA.applyImpulseAtOffset(impulse.neg(), rA);
        bodyB.applyImpulseAtOffset(impulse, rB);

        const vA2 = bodyA.velocity.add(new Vec2(-bodyA.angularVelocity * rA.y, bodyA.angularVelocity * rA.x));
        const vB2 = bodyB.velocity.add(new Vec2(-bodyB.angularVelocity * rB.y, bodyB.angularVelocity * rB.x));
        const vRel2 = vB2.sub(vA2);
        
        const tangent = vRel2.sub(normal.scale(vRel2.dot(normal)));
        const tangentLen = tangent.length();
        if (tangentLen > 0.0001) {
            const tangentDir = tangent.normalize();
            const rACrossT = rA.cross(tangentDir);
            const rBCrossT = rB.cross(tangentDir);
            
            let invMassSumT = bodyA.invMass + bodyB.invMass
                            + (rACrossT * rACrossT) * bodyA.invInertia
                            + (rBCrossT * rBCrossT) * bodyB.invInertia;
            
            let jt = -vRel2.dot(tangentDir) / invMassSumT;
            
            const mu = Math.sqrt(bodyA.friction * bodyB.friction);
            if (Math.abs(jt) > j * mu) {
                jt = Math.sign(jt) * j * mu;
            }
            
            const frictionImpulse = tangentDir.scale(jt);
            bodyA.applyImpulseAtOffset(frictionImpulse.neg(), rA);
            bodyB.applyImpulseAtOffset(frictionImpulse, rB);
        }
    }

    _enforceWalls() {
        for (const body of this.bodies) {
            if (body.isStatic) continue;

            if (body.shape === Shape.CIRCLE) {
                this._circleWalls(body);
            } else {
                this._rectWalls(body);
            }
        }
    }

    _circleWalls(body) {
        const r = body.radius;
        const e = this.wallRestitution;
        const mu = this.wallFriction;

        if (body.position.y + r > this.height) {
            body.position = new Vec2(body.position.x, this.height - r);
            if (body.velocity.y > 0) {
                body.velocity = new Vec2(
                    body.velocity.x * (1 - mu),
                    -body.velocity.y * e
                );
            }
        }
        if (body.position.y - r < 0) {
            body.position = new Vec2(body.position.x, r);
            if (body.velocity.y < 0) {
                body.velocity = new Vec2(
                    body.velocity.x * (1 - mu),
                    -body.velocity.y * e
                );
            }
        }
        if (body.position.x + r > this.width) {
            body.position = new Vec2(this.width - r, body.position.y);
            if (body.velocity.x > 0) {
                body.velocity = new Vec2(
                    -body.velocity.x * e,
                    body.velocity.y * (1 - mu)
                );
            }
        }
        if (body.position.x - r < 0) {
            body.position = new Vec2(r, body.position.y);
            if (body.velocity.x < 0) {
                body.velocity = new Vec2(
                    -body.velocity.x * e,
                    body.velocity.y * (1 - mu)
                );
            }
        }
    }

    _rectWalls(body) {
        const hw = body.width / 2;
        const hh = body.height / 2;
        const e = this.wallRestitution;
        const mu = this.wallFriction;

        if (body.position.y + hh > this.height) {
            body.position = new Vec2(body.position.x, this.height - hh);
            if (body.velocity.y > 0) {
                body.velocity = new Vec2(body.velocity.x * (1 - mu), -body.velocity.y * e);
            }
        }
        if (body.position.y - hh < 0) {
            body.position = new Vec2(body.position.x, hh);
            if (body.velocity.y < 0) {
                body.velocity = new Vec2(body.velocity.x * (1 - mu), -body.velocity.y * e);
            }
        }
        if (body.position.x + hw > this.width) {
            body.position = new Vec2(this.width - hw, body.position.y);
            if (body.velocity.x > 0) {
                body.velocity = new Vec2(-body.velocity.x * e, body.velocity.y * (1 - mu));
            }
        }
        if (body.position.x - hw < 0) {
            body.position = new Vec2(hw, body.position.y);
            if (body.velocity.x < 0) {
                body.velocity = new Vec2(-body.velocity.x * e, body.velocity.y * (1 - mu));
            }
        }
    }

    getBodyAt(pos) {
        for (let i = this.bodies.length - 1; i >= 0; i--) {
            const b = this.bodies[i];
            if (b.shape === Shape.CIRCLE) {
                if (pos.distanceTo(b.position) <= b.radius) return b;
            } else {
                const hw = b.width / 2, hh = b.height / 2;
                if (pos.x >= b.position.x - hw && pos.x <= b.position.x + hw &&
                    pos.y >= b.position.y - hh && pos.y <= b.position.y + hh) {
                    return b;
                }
            }
        }
        return null;
    }
}
