// Web Worker for calculating massive 2D grids of double pendulums
// No external dependencies to ensure fast context execution

function getDerivatives(S, i, L1, L2, m1, m2, g) {
    const theta1 = S[i];
    const omega1 = S[i+1];
    const theta2 = S[i+2];
    const omega2 = S[i+3];
    
    const dTheta = theta1 - theta2;
    const cosDTheta = Math.cos(dTheta);
    const sinDTheta = Math.sin(dTheta);
    const cos2DTheta = Math.cos(2 * dTheta);
    
    const den1 = L1 * (2*m1 + m2 - m2*cos2DTheta);
    const num1 = -g*(2*m1 + m2)*Math.sin(theta1) - m2*g*Math.sin(theta1 - 2*theta2) - 2*sinDTheta*m2*(omega2*omega2*L2 + omega1*omega1*L1*cosDTheta);
    const omega1Dot = num1 / den1;
    
    const den2 = L2 * (2*m1 + m2 - m2*cos2DTheta);
    const num2 = 2*sinDTheta*(omega1*omega1*L1*(m1 + m2) + g*(m1 + m2)*Math.cos(theta1) + omega2*omega2*L2*m2*cosDTheta);
    const omega2Dot = num2 / den2;
    
    return [omega1, omega1Dot, omega2, omega2Dot];
}

function rk4StepChunk(S, startIndex, count, dt, flipTimes, simTime) {
    const L1 = 1, L2 = 1, m1 = 1, m2 = 1, g = 9.81;
    
    for (let j = 0; j < count; j++) {
        const i = startIndex + j * 4;
        
        if (flipTimes && flipTimes[j + startIndex/4] !== 0) continue;
        
        const k1 = getDerivatives(S, i, L1, L2, m1, m2, g);
        
        const S2 = S.slice(i, i+4);
        S2[0] += k1[0]*dt/2; S2[1] += k1[1]*dt/2; S2[2] += k1[2]*dt/2; S2[3] += k1[3]*dt/2;
        const k2 = getDerivatives(S2, 0, L1, L2, m1, m2, g);
        
        const S3 = S.slice(i, i+4);
        S3[0] += k2[0]*dt/2; S3[1] += k2[1]*dt/2; S3[2] += k2[2]*dt/2; S3[3] += k2[3]*dt/2;
        const k3 = getDerivatives(S3, 0, L1, L2, m1, m2, g);
        
        const S4 = S.slice(i, i+4);
        S4[0] += k3[0]*dt; S4[1] += k3[1]*dt; S4[2] += k3[2]*dt; S4[3] += k3[3]*dt;
        const k4 = getDerivatives(S4, 0, L1, L2, m1, m2, g);
        
        S[i]   += (dt/6)*(k1[0] + 2*k2[0] + 2*k3[0] + k4[0]);
        S[i+1] += (dt/6)*(k1[1] + 2*k2[1] + 2*k3[1] + k4[1]);
        S[i+2] += (dt/6)*(k1[2] + 2*k2[2] + 2*k3[2] + k4[2]);
        S[i+3] += (dt/6)*(k1[3] + 2*k2[3] + 2*k3[3] + k4[3]);
        
        if (S[i] > Math.PI) S[i] -= 2*Math.PI; else if (S[i] < -Math.PI) S[i] += 2*Math.PI;
        if (S[i+2] > Math.PI) S[i+2] -= 2*Math.PI; else if (S[i+2] < -Math.PI) S[i+2] += 2*Math.PI;
        
        if (flipTimes) {
            if (Math.abs(S[i]) > 3.10 || Math.abs(S[i+2]) > 3.10) {
                flipTimes[j + startIndex/4] = simTime;
            }
        }
    }
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; } 
    else {
        const hue2rgb = (p, q, t) => {
            if(t < 0) t += 1; if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

let S = null;
let flipTimes = null;
let W = 0, H = 0;
let mode = '';
let simTime = 0;
let dt = 0.02;
let isRunning = false;

self.onmessage = function(e) {
    const msg = e.data;
    
    if (msg.type === 'start') {
        mode = msg.mode;
        W = msg.width;
        H = msg.height;
        isRunning = true;
        simTime = 0;
        
        const count = W * H;
        S = new Float32Array(count * 4);
        if (mode === 'chaosTimeToFlip') {
            flipTimes = new Float32Array(count);
        } else {
            flipTimes = null;
        }
        
        for (let y = 0; y < H; y++) {
            const theta2 = (y / H) * 2 * Math.PI - Math.PI;
            for (let x = 0; x < W; x++) {
                const theta1 = (x / W) * 2 * Math.PI - Math.PI;
                const idx = (y * W + x) * 4;
                S[idx] = theta1;
                S[idx+1] = 0;
                S[idx+2] = theta2;
                S[idx+3] = 0;
            }
        }
        
        self.postMessage({ type: 'initialized' });
        simLoop();
    } else if (msg.type === 'stop') {
        isRunning = false;
        S = null;
        flipTimes = null;
    }
};

function simLoop() {
    if (!isRunning) return;
    
    const count = W * H;
    const chunkSize = 100000;
    
    for (let c = 0; c < count; c += chunkSize) {
        const cCount = Math.min(chunkSize, count - c);
        rk4StepChunk(S, c * 4, cCount, dt, flipTimes, simTime);
    }
    simTime += dt;
    
    const imgData = new Uint8ClampedArray(W * H * 4);
    
    if (mode === 'chaosPhaseSpace') {
        const PI = Math.PI;
        for (let i = 0; i < count; i++) {
            const t1 = S[i*4];
            const t2 = S[i*4 + 2];
            
            const hue = (t1 + PI) / (2 * PI);
            const lightness = 0.2 + 0.6 * ((t2 + PI) / (2 * PI));
            
            const [r, g, b] = hslToRgb(hue, 1.0, lightness);
            imgData[i*4] = r;
            imgData[i*4+1] = g;
            imgData[i*4+2] = b;
            imgData[i*4+3] = 255;
        }
    } else if (mode === 'chaosTimeToFlip') {
        for (let i = 0; i < count; i++) {
            const t = flipTimes[i];
            let r=255, g=255, b=255;
            
            if (t > 0) {
                let hue = 0;
                if (t <= 5) {
                    hue = 0.66 - (t / 5) * (0.66 - 0.08);
                } else {
                    hue = Math.max(0, 0.08 - ((t - 5) / 65) * 0.08);
                }
                const rgb = hslToRgb(hue, 1.0, 0.5);
                r = rgb[0];
                g = rgb[1];
                b = rgb[2];
            } else if (simTime >= 70) {
                r=255; g=255; b=255;
            } else {
                r=0; g=0; b=0;
            }
            imgData[i*4] = r;
            imgData[i*4+1] = g;
            imgData[i*4+2] = b;
            imgData[i*4+3] = 255;
        }
    }
    
    self.postMessage({
        type: 'frame',
        simTime: simTime,
        imgData: imgData.buffer,
        width: W,
        height: H
    }, [imgData.buffer]);
    
    if (mode === 'chaosTimeToFlip' && simTime >= 70) {
        self.postMessage({ type: 'done' });
        isRunning = false;
        return;
    }
    
    setTimeout(simLoop, 0);
}
