/**
 * Vec2 — Immutable 2D Vector class for physics calculations.
 * All operations return new Vec2 instances (immutable pattern).
 */
export class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /** Add another vector */
    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }

    /** Subtract another vector */
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }

    /** Multiply by scalar */
    scale(s) { return new Vec2(this.x * s, this.y * s); }

    /** Dot product */
    dot(v) { return this.x * v.x + this.y * v.y; }

    /** 2D cross product (scalar) */
    cross(v) { return this.x * v.y - this.y * v.x; }

    /** Magnitude */
    length() { return Math.sqrt(this.x * this.x + this.y * this.y); }

    /** Squared magnitude (avoids sqrt) */
    lengthSq() { return this.x * this.x + this.y * this.y; }

    /** Unit vector (returns zero vector if length is 0) */
    normalize() {
        const len = this.length();
        if (len === 0) return new Vec2(0, 0);
        return new Vec2(this.x / len, this.y / len);
    }

    /** Rotate by angle (radians) */
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vec2(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos
        );
    }

    /** Distance to another vector */
    distanceTo(v) { return this.sub(v).length(); }

    /** Perpendicular (90° CCW) */
    perp() { return new Vec2(-this.y, this.x); }

    /** Negate */
    neg() { return new Vec2(-this.x, -this.y); }

    /** Lerp between this and v by t ∈ [0,1] */
    lerp(v, t) {
        return new Vec2(
            this.x + (v.x - this.x) * t,
            this.y + (v.y - this.y) * t
        );
    }

    /** Clone */
    clone() { return new Vec2(this.x, this.y); }

    /** Reflect this vector about a normal n */
    reflect(n) {
        return this.sub(n.scale(2 * this.dot(n)));
    }

    /** String representation */
    toString() { return `(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`; }

    /** Static zero vector */
    static zero() { return new Vec2(0, 0); }

    /** Static from angle (unit vector) */
    static fromAngle(angle) {
        return new Vec2(Math.cos(angle), Math.sin(angle));
    }
}
