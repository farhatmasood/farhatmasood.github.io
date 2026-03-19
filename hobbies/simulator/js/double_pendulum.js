export class DoublePendulum {
    constructor(theta1, theta2, m1=1, m2=1, L1=1, L2=1, g=9.81) {
        this.state = [theta1, 0, theta2, 0]; // [theta1, omega1, theta2, omega2]
        this.m1 = m1;
        this.m2 = m2;
        this.L1 = L1;
        this.L2 = L2;
        this.g = g;
        
        // Custom color for rendering (Butterfly effect)
        this.color = '#ffffff';
        this.trail = [];
        this.maxTrailLength = 100;
    }
    
    getDerivatives(state) {
        const [theta1, omega1, theta2, omega2] = state;
        const g = this.g;
        const m1 = this.m1;
        const m2 = this.m2;
        const L1 = this.L1;
        const L2 = this.L2;
        
        const delta = theta1 - theta2;
        
        const den1 = L1 * (2*m1 + m2 - m2*Math.cos(2*theta1 - 2*theta2));
        const num1 = -g*(2*m1 + m2)*Math.sin(theta1) - m2*g*Math.sin(theta1 - 2*theta2) - 2*Math.sin(theta1 - theta2)*m2*(omega2*omega2*L2 + omega1*omega1*L1*Math.cos(theta1 - theta2));
        const omega1Dot = num1 / den1;
        
        const den2 = L2 * (2*m1 + m2 - m2*Math.cos(2*theta1 - 2*theta2));
        const num2 = 2*Math.sin(theta1 - theta2)*(omega1*omega1*L1*(m1 + m2) + g*(m1 + m2)*Math.cos(theta1) + omega2*omega2*L2*m2*Math.cos(theta1 - theta2));
        const omega2Dot = num2 / den2;
        
        return [omega1, omega1Dot, omega2, omega2Dot];
    }
    
    step(dt) {
        const y = this.state;
        
        const k1 = this.getDerivatives(y);
        
        const y2 = y.map((val, i) => val + k1[i] * dt / 2);
        const k2 = this.getDerivatives(y2);
        
        const y3 = y.map((val, i) => val + k2[i] * dt / 2);
        const k3 = this.getDerivatives(y3);
        
        const y4 = y.map((val, i) => val + k3[i] * dt);
        const k4 = this.getDerivatives(y4);
        
        for (let i = 0; i < 4; i++) {
            this.state[i] += (dt / 6) * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]);
        }
    }
    
    getPositions(anchorX, anchorY, scale) {
        const [theta1, _, theta2, __] = this.state;
        // In screen coordinates, positive y is down.
        // theta is angle from the negative y-axis (hanging down)
        const x1 = anchorX + this.L1 * scale * Math.sin(theta1);
        const y1 = anchorY + this.L1 * scale * Math.cos(theta1);
        const x2 = x1 + this.L2 * scale * Math.sin(theta2);
        const y2 = y1 + this.L2 * scale * Math.cos(theta2);
        return {x1, y1, x2, y2};
    }
    
    recordTrail(anchorX, anchorY, scale) {
        const p = this.getPositions(anchorX, anchorY, scale);
        this.trail.push({x: p.x2, y: p.y2});
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
    }
}
