/**
 * Renderer — Canvas-based rendering for the physics simulation.
 * Draws bodies, velocity vectors, trails, springs, grid, energy overlay.
 */
import { Vec2 } from './vector.js';
import { Shape } from './physics.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.showGrid = true;
        this.showVelocityVectors = false;
        this.showForceVectors = false;
        this.showTrails = true;
        this.showInfo = true;
        this.gridSize = 50;
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
    }

    clear() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0a0e1a');
        grad.addColorStop(1, '#111827');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    drawGrid() {
        if (!this.showGrid) return;
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const gs = this.gridSize;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += gs) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        for (let y = 0; y <= h; y += gs) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += gs * 5) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        for (let y = 0; y <= h; y += gs * 5) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();
    }

    drawTrails(bodies) {
        if (!this.showTrails) return;
        const ctx = this.ctx;

        for (const body of bodies) {
            if (body.isStatic || body.trail.length < 2) continue;

            ctx.beginPath();
            ctx.moveTo(body.trail[0].x, body.trail[0].y);

            for (let i = 1; i < body.trail.length; i++) {
                ctx.lineTo(body.trail[i].x, body.trail[i].y);
            }

            const alpha = 0.5;
            ctx.strokeStyle = this._withAlpha(body.color, alpha);
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    drawSprings(springs) {
        const ctx = this.ctx;

        for (const spring of springs) {
            const a = spring.bodyA.position;
            const b = spring.bodyB.position;

            const delta = b.sub(a);
            const len = delta.length();
            const dir = delta.normalize();
            const perp = dir.perp();
            const segments = 16;
            const segLen = len / segments;
            const amplitude = 8;

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);

            for (let i = 1; i < segments; i++) {
                const t = i / segments;
                const point = a.add(dir.scale(segLen * i));
                const offset = (i % 2 === 0 ? 1 : -1) * amplitude;
                const zigzag = point.add(perp.scale(offset));
                ctx.lineTo(zigzag.x, zigzag.y);
            }

            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = 'rgba(255, 200, 50, 0.7)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    drawJoints(joints) {
        const ctx = this.ctx;
        for (const joint of joints) {
            const pA = joint.getWorldAnchorA();
            const pB = joint.getWorldAnchorB();

            ctx.beginPath();
            ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(pB.x, pB.y);
            ctx.strokeStyle = 'rgba(200, 200, 220, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.arc(pA.x, pA.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(pB.x, pB.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawBody(body, isSelected = false, isHovered = false) {
        const ctx = this.ctx;

        ctx.save();

        if (body.shape === Shape.CIRCLE) {
            this._drawCircle(body, isSelected, isHovered);
        } else {
            this._drawRect(body, isSelected, isHovered);
        }

        if (body.label) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(body.label, body.position.x, body.position.y);
        }

        ctx.restore();
    }

    _drawCircle(body, isSelected, isHovered) {
        const ctx = this.ctx;
        const { x, y } = body.position;
        const r = body.radius;

        if (isSelected || isHovered) {
            ctx.shadowColor = isSelected ? '#4fc3f7' : 'rgba(255,255,255,0.3)';
            ctx.shadowBlur = isSelected ? 20 : 10;
        }

        const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        grad.addColorStop(0, this._lighten(body.color, 40));
        grad.addColorStop(1, body.color);

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = body.isStatic ? 'rgba(100, 100, 120, 0.8)' : grad;
        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.strokeStyle = isSelected
            ? '#4fc3f7'
            : (body.isStatic ? 'rgba(150,150,170,0.6)' : this._lighten(body.color, 20));
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();

        const cos = Math.cos(body.angle);
        const sin = Math.sin(body.angle);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cos * r * 0.8, y + sin * r * 0.8);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    _drawRect(body, isSelected, isHovered) {
        const ctx = this.ctx;
        const { x, y } = body.position;
        const hw = body.width / 2;
        const hh = body.height / 2;

        if (isSelected || isHovered) {
            ctx.shadowColor = isSelected ? '#4fc3f7' : 'rgba(255,255,255,0.3)';
            ctx.shadowBlur = isSelected ? 20 : 10;
        }

        ctx.translate(x, y);
        ctx.rotate(body.angle);

        const grad = ctx.createLinearGradient(-hw, -hh, hw, hh);
        grad.addColorStop(0, this._lighten(body.color, 20));
        grad.addColorStop(1, body.color);

        const radius = Math.min(hw, hh, 6);
        this._roundRect(-hw, -hh, body.width, body.height, radius);
        ctx.fillStyle = body.isStatic ? 'rgba(80, 85, 100, 0.9)' : grad;
        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.strokeStyle = isSelected
            ? '#4fc3f7'
            : (body.isStatic ? 'rgba(150,150,170,0.5)' : this._lighten(body.color, 20));
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();

        ctx.rotate(-body.angle);
        ctx.translate(-x, -y);
    }

    drawVelocityVectors(bodies) {
        if (!this.showVelocityVectors) return;
        const ctx = this.ctx;

        for (const body of bodies) {
            if (body.isStatic) continue;
            const speed = body.velocity.length();
            if (speed < 0.5) continue;

            const scale = 0.15;
            const end = body.position.add(body.velocity.scale(scale));

            ctx.beginPath();
            ctx.moveTo(body.position.x, body.position.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = 2;
            ctx.stroke();

            const dir = body.velocity.normalize();
            const perp = dir.perp();
            const headLen = 8;
            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(
                end.x - dir.x * headLen + perp.x * headLen * 0.4,
                end.y - dir.y * headLen + perp.y * headLen * 0.4
            );
            ctx.lineTo(
                end.x - dir.x * headLen - perp.x * headLen * 0.4,
                end.y - dir.y * headLen - perp.y * headLen * 0.4
            );
            ctx.closePath();
            ctx.fillStyle = '#ff6b6b';
            ctx.fill();
        }
    }

    drawSlingshot(start, current) {
        if (!start || !current) return;
        const ctx = this.ctx;

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(current.x, current.y);
        ctx.strokeStyle = 'rgba(255, 107, 107, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        const vel = start.sub(current);
        const arrowEnd = start.add(vel.scale(0.3));
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(arrowEnd.x, arrowEnd.y);
        ctx.strokeStyle = 'rgba(76, 175, 80, 0.8)';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        const speed = vel.length();
        ctx.fillStyle = 'rgba(76, 175, 80, 0.9)';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        const midX = (start.x + arrowEnd.x) / 2;
        const midY = (start.y + arrowEnd.y) / 2;
        ctx.fillText(`${(speed * 0.5).toFixed(0)} px/s`, midX, midY - 12);
    }

    drawTrajectory(startPos, launchVel, gravity, steps = 60) {
        if (launchVel.lengthSq() < 1) return;
        const ctx = this.ctx;
        const dt = 1 / 60;

        let pos = startPos.clone();
        let vel = launchVel.clone();

        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);

        for (let i = 0; i < steps; i++) {
            vel = vel.add(gravity.scale(dt));
            pos = pos.add(vel.scale(dt));
            ctx.lineTo(pos.x, pos.y);
        }

        ctx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawEnergyOverlay(ke, pe, total) {
        if (!this.showInfo) return;
        const ctx = this.ctx;
        const x = 12;
        const y = 12;
        const w = 180;
        const h = 70;

        ctx.fillStyle = 'rgba(10, 14, 26, 0.75)';
        this._roundRectPath(x, y, w, h, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'left';

        const maxE = Math.max(total, 1);
        const barW = 100;
        const barH = 8;

        ctx.fillStyle = '#aaa';
        ctx.fillText('KE', x + 8, y + 18);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x + 30, y + 11, barW, barH);
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(x + 30, y + 11, Math.min(barW, (ke / maxE) * barW), barH);
        ctx.fillStyle = '#ccc';
        ctx.fillText(`${ke.toFixed(0)}`, x + 135, y + 18);

        ctx.fillStyle = '#aaa';
        ctx.fillText('PE', x + 8, y + 36);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x + 30, y + 29, barW, barH);
        ctx.fillStyle = '#4ecdc4';
        ctx.fillRect(x + 30, y + 29, Math.min(barW, (pe / maxE) * barW), barH);
        ctx.fillStyle = '#ccc';
        ctx.fillText(`${pe.toFixed(0)}`, x + 135, y + 36);

        ctx.fillStyle = '#888';
        ctx.fillText(`Total: ${total.toFixed(0)}`, x + 8, y + 56);
    }

    drawStats(bodyCount, fps) {
        if (!this.showInfo) return;
        const ctx = this.ctx;
        const w = this.canvas.width;

        ctx.fillStyle = 'rgba(150, 150, 170, 0.6)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`Bodies: ${bodyCount}  |  FPS: ${fps}`, w - 14, 22);
    }

    drawWalls() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.strokeStyle = 'rgba(100, 120, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
    }

    // ─── Helpers ──────────────────────────────────────────────

    _roundRect(x, y, w, h, r) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    _roundRectPath(x, y, w, h, r) {
        this._roundRect(x, y, w, h, r);
    }

    _expandHex(hex) {
        if (hex.length === 4) {
            return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        return hex;
    }

    _withAlpha(hex, alpha) {
        hex = this._expandHex(hex);
        const r = parseInt(hex.slice(1, 3), 16) || 0;
        const g = parseInt(hex.slice(3, 5), 16) || 0;
        const b = parseInt(hex.slice(5, 7), 16) || 0;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    _lighten(hex, amount) {
        hex = this._expandHex(hex);
        let r = parseInt(hex.slice(1, 3), 16) || 0;
        let g = parseInt(hex.slice(3, 5), 16) || 0;
        let b = parseInt(hex.slice(5, 7), 16) || 0;
        r = Math.min(255, r + amount);
        g = Math.min(255, g + amount);
        b = Math.min(255, b + amount);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
}
