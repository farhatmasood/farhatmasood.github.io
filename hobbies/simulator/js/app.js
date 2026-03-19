/**
 * App — Main application: game loop, UI controls, mouse interaction, preset scenes.
 * Modified to support URL parameters: ?preset=X&embed=1 for iframe embedding.
 */
import { Vec2 } from './vector.js';
import { World, Body, Spring, Shape } from './physics.js';
import { Renderer } from './renderer.js';
import { DoublePendulum } from './double_pendulum.js';

// ─── Color Palette ────────────────────────────────────────────
const COLORS = [
    '#4fc3f7', '#ff6b6b', '#4ecdc4', '#f7dc6f', '#bb86fc',
    '#80cbc4', '#ff8a65', '#a5d6a7', '#f48fb1', '#90caf9',
];

let colorIndex = 0;
function nextColor() {
    const c = COLORS[colorIndex % COLORS.length];
    colorIndex++;
    return c;
}

// ─── App Class ───────────────────────────────────────────────
export class App {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.sidebar = document.getElementById('sidebar');

        // Check embed mode from URL params
        const params = new URLSearchParams(window.location.search);
        this.embedMode = params.get('embed') === '1';
        this.autoPreset = params.get('preset');

        if (this.embedMode) {
            document.body.classList.add('embed-mode');
        }

        this._resizeCanvas();

        this.world = new World(this.canvas.width, this.canvas.height);
        this.renderer = new Renderer(this.canvas);

        // State
        this.running = true;
        this.fps = 60;
        this.lastTime = 0;
        this.frameCount = 0;
        this.fpsTimer = 0;

        // Chaos State
        this.chaosMode = null; 
        this.chaosPendulums = [];
        this.chaosWorker = null;
        this.chaosImageData = null;

        // Interaction state
        this.mode = 'spawn';
        this.spawnShape = Shape.CIRCLE;
        this.spawnRadius = 20;
        this.spawnMass = 1;
        this.selectedBody = null;
        this.hoveredBody = null;

        // Slingshot drag
        this.isDragging = false;
        this.dragStart = null;
        this.dragCurrent = null;
        this.dragBody = null;

        // Bind UI
        this._bindControls();
        this._bindMouse();
        this._bindKeyboard();

        // Load preset from URL or default
        this._loadPreset(this.autoPreset || 'freeFall');

        // Start loop
        requestAnimationFrame((t) => this._loop(t));
    }

    // ─── Game Loop ────────────────────────────────────────────
    _loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        this.frameCount++;
        this.fpsTimer += dt;
        if (this.fpsTimer >= 1) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsTimer = 0;
        }

        if (this.running) {
            if (this.chaosMode === 'chaosButterfly') {
                for (const p of this.chaosPendulums) {
                    p.step(dt);
                    p.recordTrail(this.canvas.width / 2, this.canvas.height / 3, 150);
                }
            } else {
                this.world.step(dt);
            }
        }

        // Render
        this.renderer.clear();
        
        if (this.chaosMode === 'chaosPhaseSpace' || this.chaosMode === 'chaosTimeToFlip') {
            if (this.chaosImageData) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = this.chaosImageData.width;
                tempCanvas.height = this.chaosImageData.height;
                tempCanvas.getContext('2d').putImageData(this.chaosImageData, 0, 0);
                this.renderer.ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, this.canvas.width, this.canvas.height);
            }
        } else {
            this.renderer.drawGrid();
            this.renderer.drawWalls();
            this.renderer.drawTrails(this.world.bodies);
            this.renderer.drawSprings(this.world.springs);
            this.renderer.drawJoints(this.world.joints);

            for (const body of this.world.bodies) {
                const isSelected = body === this.selectedBody;
                const isHovered = body === this.hoveredBody;
                this.renderer.drawBody(body, isSelected, isHovered);
            }

            this.renderer.drawVelocityVectors(this.world.bodies);

            if (this.chaosMode === 'chaosButterfly') {
                this._drawChaosPendulums();
            }
        }

        // Slingshot UI
        if (this.isDragging && this.dragStart && this.dragCurrent) {
            this.renderer.drawSlingshot(this.dragStart, this.dragCurrent);
            const launchVel = this.dragStart.sub(this.dragCurrent).scale(0.5);
            this.renderer.drawTrajectory(this.dragStart, launchVel, this.world.gravity);
        }

        this.renderer.drawEnergyOverlay(
            this.world.totalKE,
            this.world.totalPE,
            this.world.totalEnergy
        );
        this.renderer.drawStats(this.world.bodies.length, this.fps);

        this._updateInfoPanel();

        requestAnimationFrame((t) => this._loop(t));
    }

    // ─── UI Controls Binding ─────────────────────────────────
    _bindControls() {
        document.getElementById('btn-play').addEventListener('click', () => {
            this.running = true;
            this._updatePlayPauseBtn();
        });
        document.getElementById('btn-pause').addEventListener('click', () => {
            this.running = false;
            this._updatePlayPauseBtn();
        });
        document.getElementById('btn-step').addEventListener('click', () => {
            this.running = false;
            this._updatePlayPauseBtn();
            this.world.step(1 / 60);
        });
        document.getElementById('btn-clear').addEventListener('click', () => {
            this.world.clear();
            this.selectedBody = null;
            colorIndex = 0;
        });

        // Gravity slider
        const gravSlider = document.getElementById('slider-gravity');
        const gravValue = document.getElementById('val-gravity');
        gravSlider.addEventListener('input', () => {
            const g = parseFloat(gravSlider.value);
            gravValue.textContent = g.toFixed(1);
            this.world.gravity = new Vec2(0, g * 60);
        });

        // Air drag slider
        const dragSlider = document.getElementById('slider-drag');
        const dragValue = document.getElementById('val-drag');
        dragSlider.addEventListener('input', () => {
            const d = parseFloat(dragSlider.value);
            dragValue.textContent = d.toFixed(3);
            this.world.airDrag = d;
        });

        // Restitution slider
        const restSlider = document.getElementById('slider-restitution');
        const restValue = document.getElementById('val-restitution');
        restSlider.addEventListener('input', () => {
            const r = parseFloat(restSlider.value);
            restValue.textContent = r.toFixed(2);
        });

        // Friction slider
        const fricSlider = document.getElementById('slider-friction');
        const fricValue = document.getElementById('val-friction');
        fricSlider.addEventListener('input', () => {
            const f = parseFloat(fricSlider.value);
            fricValue.textContent = f.toFixed(2);
        });

        // Time scale slider
        const timeSlider = document.getElementById('slider-timescale');
        const timeValue = document.getElementById('val-timescale');
        timeSlider.addEventListener('input', () => {
            const t = parseFloat(timeSlider.value);
            timeValue.textContent = t.toFixed(1) + '×';
            this.world.timeScale = t;
        });

        // Spawn size slider
        const sizeSlider = document.getElementById('slider-size');
        const sizeValue = document.getElementById('val-size');
        sizeSlider.addEventListener('input', () => {
            this.spawnRadius = parseInt(sizeSlider.value);
            sizeValue.textContent = this.spawnRadius;
        });

        // Spawn mass slider
        const massSlider = document.getElementById('slider-mass');
        const massValue = document.getElementById('val-mass');
        massSlider.addEventListener('input', () => {
            this.spawnMass = parseFloat(massSlider.value);
            massValue.textContent = this.spawnMass.toFixed(1);
        });

        // Shape selector
        document.querySelectorAll('.shape-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.spawnShape = btn.dataset.shape;
            });
        });

        // Toggles
        document.getElementById('toggle-velocity').addEventListener('change', (e) => {
            this.renderer.showVelocityVectors = e.target.checked;
        });
        document.getElementById('toggle-trails').addEventListener('change', (e) => {
            this.renderer.showTrails = e.target.checked;
        });
        document.getElementById('toggle-grid').addEventListener('change', (e) => {
            this.renderer.showGrid = e.target.checked;
        });

        // Presets (Normal)
        document.querySelectorAll('.preset-btn:not(.chaos-btn)').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.preset-btn, .chaos-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const chaosControls = document.getElementById('chaos-controls');
                if (chaosControls) chaosControls.style.display = 'none';
                
                const chaosProgress = document.getElementById('chaos-progress-container');
                if (chaosProgress) chaosProgress.style.display = 'none';
                
                this._loadPreset(btn.dataset.preset);
            });
        });

        // Chaos Presets
        document.querySelectorAll('.chaos-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                document.querySelectorAll('.preset-btn, .chaos-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                document.getElementById('chaos-controls').style.display = 'block';
                
                this._loadChaosMode(mode);
            });
        });

        // Chaos Controls
        const sliderT1 = document.getElementById('slider-theta1');
        const valT1 = document.getElementById('val-theta1');
        if (sliderT1) sliderT1.addEventListener('input', () => valT1.textContent = sliderT1.value);
        
        const sliderT2 = document.getElementById('slider-theta2');
        const valT2 = document.getElementById('val-theta2');
        if (sliderT2) sliderT2.addEventListener('input', () => valT2.textContent = sliderT2.value);

        const btnRunChaos = document.getElementById('btn-run-chaos');
        if (btnRunChaos) {
            btnRunChaos.addEventListener('click', () => {
                if (this.chaosMode) {
                    this._loadChaosMode(this.chaosMode);
                }
            });
        }

        // Window resize
        window.addEventListener('resize', () => {
            this._resizeCanvas();
            this.world.width = this.canvas.width;
            this.world.height = this.canvas.height;
        });

        // ─── Engine Settings ─────────────────────────────────────
        const solverSelect = document.getElementById('select-solver');
        if (solverSelect) {
            solverSelect.addEventListener('change', (e) => {
                this.world.solver = e.target.value;
            });
        }

        const substepsSlider = document.getElementById('slider-substeps');
        const substepsValue = document.getElementById('val-substeps');
        if (substepsSlider) {
            substepsSlider.addEventListener('input', (e) => {
                const steps = parseInt(e.target.value);
                substepsValue.textContent = steps;
                this.world.substeps = steps;
            });
        }

        const boundsSelect = document.getElementById('select-bounds');
        if (boundsSelect) {
            boundsSelect.addEventListener('change', (e) => {
                this.world.boundsMode = e.target.value;
            });
        }

        // ─── Body Inspector Actions ──────────────────────────────
        const btnFreeze = document.getElementById('btn-body-freeze');
        if (btnFreeze) {
            btnFreeze.addEventListener('click', () => {
                if (this.selectedBody) {
                    this.selectedBody.isStatic = !this.selectedBody.isStatic;
                    if (this.selectedBody.isStatic) {
                        this.selectedBody.mass = 0;
                        this.selectedBody.invMass = 0;
                        this.selectedBody.velocity = Vec2.zero();
                    } else {
                        this.selectedBody.mass = this.spawnMass;
                        this.selectedBody.invMass = 1 / this.selectedBody.mass;
                    }
                    this._updateInfoPanel();
                }
            });
        }

        const btnDelete = document.getElementById('btn-body-delete');
        if (btnDelete) {
            btnDelete.addEventListener('click', () => {
                if (this.selectedBody) {
                    this.world.removeBody(this.selectedBody);
                    this.selectedBody = null;
                    this._updateInfoPanel();
                }
            });
        }
    }

    // ─── Mouse Interaction ──────────────────────────────────
    _bindMouse() {
        const canvas = this.canvas;

        canvas.addEventListener('mousedown', (e) => {
            const pos = this._mousePos(e);
            const body = this.world.getBodyAt(pos);

            if (e.button === 2) {
                e.preventDefault();
                if (body) {
                    this.selectedBody = body;
                } else {
                    this.selectedBody = null;
                }
                return;
            }

            if (body && !body.isStatic) {
                this.isDragging = true;
                this.dragBody = body;
                this.dragStart = body.position.clone();
                this.dragCurrent = pos;
            } else if (!body) {
                this.isDragging = true;
                this.dragBody = null;
                this.dragStart = pos;
                this.dragCurrent = pos;
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            const pos = this._mousePos(e);
            this.hoveredBody = this.world.getBodyAt(pos);

            if (this.isDragging) {
                this.dragCurrent = pos;
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (!this.isDragging) return;

            const pos = this._mousePos(e);

            if (this.dragBody) {
                const impulse = this.dragStart.sub(pos).scale(0.5);
                this.dragBody.velocity = impulse;
            } else if (this.dragStart) {
                const velocity = this.dragStart.sub(pos).scale(0.5);
                const restitution = parseFloat(document.getElementById('slider-restitution').value);
                const friction = parseFloat(document.getElementById('slider-friction').value);

                const body = new Body({
                    position: this.dragStart,
                    velocity: velocity,
                    mass: this.spawnMass,
                    shape: this.spawnShape,
                    radius: this.spawnRadius,
                    width: this.spawnRadius * 2,
                    height: this.spawnRadius * 2,
                    restitution: restitution,
                    friction: friction,
                    color: nextColor(),
                });
                this.world.addBody(body);
            }

            this.isDragging = false;
            this.dragStart = null;
            this.dragCurrent = null;
            this.dragBody = null;
        });

        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // ─── Keyboard ─────────────────────────────────────────────
    _bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    this.running = !this.running;
                    this._updatePlayPauseBtn();
                    break;
                case 'Delete':
                case 'Backspace':
                    if (this.selectedBody) {
                        this.world.removeBody(this.selectedBody);
                        this.selectedBody = null;
                    }
                    break;
                case 'c':
                    this.world.clear();
                    this.selectedBody = null;
                    colorIndex = 0;
                    break;
                case 's':
                    this.world.step(1 / 60);
                    break;
            }
        });
    }

    // ─── Reset World Defaults ────────────────────────────────
    _resetWorldDefaults() {
        this.world.gravity = new Vec2(0, 9.81 * 60);
        document.getElementById('slider-gravity').value = 9.81;
        document.getElementById('val-gravity').textContent = '9.8';

        this.world.airDrag = 0.001;
        document.getElementById('slider-drag').value = 0.001;
        document.getElementById('val-drag').textContent = '0.001';

        this.world.timeScale = 1.0;
        document.getElementById('slider-timescale').value = 1;
        document.getElementById('val-timescale').textContent = '1.0×';

        const solverSelect = document.getElementById('select-solver');
        if (solverSelect) {
            solverSelect.value = 'euler';
            this.world.solver = 'euler';
        }
        const substepsSlider = document.getElementById('slider-substeps');
        const substepsValue = document.getElementById('val-substeps');
        if (substepsSlider && substepsValue) {
            substepsSlider.value = 8;
            substepsValue.textContent = '8';
            this.world.substeps = 8;
        }
        const boundsSelect = document.getElementById('select-bounds');
        if (boundsSelect) {
            boundsSelect.value = 'solid';
            this.world.boundsMode = 'solid';
        }
    }

    // ─── Preset Scenes ───────────────────────────────────────
    _loadPreset(name) {
        this.world.clear();
        this.selectedBody = null;
        this.chaosMode = null;
        colorIndex = 0;
        this._resetWorldDefaults();

        const W = this.canvas.width;
        const H = this.canvas.height;

        switch (name) {
            case 'freeFall':
                this._presetFreeFall(W, H);
                break;
            case 'projectile':
                this._presetProjectile(W, H);
                break;
            case 'pendulum':
                this._presetPendulum(W, H);
                break;
            case 'cradle':
                this._presetNewtonCradle(W, H);
                break;
            case 'billiards':
                this._presetBilliards(W, H);
                break;
            case 'stacking':
                this._presetStacking(W, H);
                break;
            case 'gyroscope':
                this._presetGyroscope(W, H);
                break;
            case 'doublePendulum':
                this._presetDoublePendulum(W, H);
                break;
            case 'invertedPendulum':
                this._presetInvertedPendulum(W, H);
                break;
        }
    }

    // ─── Chaos Implementations ────────────────────────────────
    _loadChaosMode(mode) {
        this.world.clear();
        this.selectedBody = null;
        this.chaosMode = mode;
        this.chaosPendulums = [];
        this.chaosImageData = null;
        
        if (this.chaosWorker) {
            this.chaosWorker.postMessage({type: 'stop'});
            this.chaosWorker.terminate();
            this.chaosWorker = null;
        }
        
        document.getElementById('chaos-progress-container').style.display = 'none';
        
        const t1 = parseFloat(document.getElementById('slider-theta1').value) * Math.PI / 180;
        const t2 = parseFloat(document.getElementById('slider-theta2').value) * Math.PI / 180;
        
        if (mode === 'chaosButterfly') {
            const count = 1000;
            const delta = 0.00000001 * (Math.PI / 180);
            
            for (let i = 0; i < count; i++) {
                const pend = new DoublePendulum(t1, t2 + i * delta);
                const hue = 240 - (i / count) * 240;
                pend.color = `hsl(${hue}, 100%, 60%)`;
                this.chaosPendulums.push(pend);
            }
            this.running = true;
            this._updatePlayPauseBtn();
        } else if (mode === 'chaosPhaseSpace' || mode === 'chaosTimeToFlip') {
            this.running = false; 
            this._updatePlayPauseBtn();
            
            document.getElementById('chaos-progress-container').style.display = 'block';
            document.getElementById('chaos-progress-bar').style.width = '0%';
            document.getElementById('chaos-progress-text').textContent = "Calculating grids...";
            
            this.chaosWorker = new Worker('js/chaos_worker.js');
            this.chaosWorker.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'frame') {
                    const arr = new Uint8ClampedArray(msg.imgData);
                    this.chaosImageData = new ImageData(arr, msg.width, msg.height);
                    
                    const maxTime = 70;
                    const pct = Math.min(100, (msg.simTime / maxTime) * 100);
                    document.getElementById('chaos-progress-bar').style.width = `${pct}%`;
                    document.getElementById('chaos-progress-text').textContent = `Simulating... ${msg.simTime.toFixed(1)}s`;
                } else if (msg.type === 'done') {
                    document.getElementById('chaos-progress-text').textContent = `Complete. mapped ${msg.width || 2000}x${msg.height || 2000}`;
                }
            };
            
            this.chaosWorker.postMessage({
                type: 'start',
                mode: mode,
                width: 2000,
                height: 2000
            });
        }
    }

    _drawChaosPendulums() {
        const ctx = this.renderer.ctx;
        const anchorX = this.canvas.width / 2;
        const anchorY = this.canvas.height / 3;
        const scale = 150;
        
        ctx.save();
        
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.arc(anchorX, anchorY, 4, 0, Math.PI * 2);
        ctx.fill();

        for (const p of this.chaosPendulums) {
            const pos = p.getPositions(anchorX, anchorY, scale);
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(anchorX, anchorY);
            ctx.lineTo(pos.x1, pos.y1);
            ctx.lineTo(pos.x2, pos.y2);
            ctx.stroke();

            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(pos.x2, pos.y2, 3, 0, Math.PI * 2);
            ctx.fill();
            
            if (this.renderer.showTrails && p.trail.length > 1) {
                ctx.beginPath();
                ctx.moveTo(p.trail[0].x, p.trail[0].y);
                for (let i = 1; i < p.trail.length; i++) {
                    ctx.lineTo(p.trail[i].x, p.trail[i].y);
                }
                ctx.strokeStyle = p.color;
                ctx.globalAlpha = 0.3;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        }
        
        ctx.restore();
    }

    _presetFreeFall(W, H) {
        this.world.addBody(new Body({
            position: new Vec2(W / 2, H - 15),
            shape: Shape.RECT,
            width: W,
            height: 30,
            isStatic: true,
            color: '#3d405b',
            label: 'Floor'
        }));

        for (let i = 0; i < 5; i++) {
            this.world.addBody(new Body({
                position: new Vec2(150 + i * 120, 80 + i * 30),
                mass: 1 + i * 0.5,
                radius: 15 + i * 5,
                restitution: 0.7,
                friction: 0.2,
                color: nextColor(),
            }));
        }
    }

    _presetProjectile(W, H) {
        this.world.addBody(new Body({
            position: new Vec2(W / 2, H - 15),
            shape: Shape.RECT,
            width: W,
            height: 30,
            isStatic: true,
            color: '#3d405b',
        }));

        const speed = 600;
        const angle = -Math.PI / 4;
        this.world.addBody(new Body({
            position: new Vec2(80, H - 50),
            velocity: new Vec2(speed * Math.cos(angle), speed * Math.sin(angle)),
            mass: 2,
            radius: 12,
            restitution: 0.3,
            friction: 0.3,
            color: '#ff6b6b',
            label: '45°'
        }));

        const angle2 = -Math.PI / 3;
        this.world.addBody(new Body({
            position: new Vec2(80, H - 50),
            velocity: new Vec2(speed * Math.cos(angle2), speed * Math.sin(angle2)),
            mass: 2,
            radius: 12,
            restitution: 0.3,
            friction: 0.3,
            color: '#4ecdc4',
            label: '60°'
        }));

        const angle3 = -Math.PI / 6;
        this.world.addBody(new Body({
            position: new Vec2(80, H - 50),
            velocity: new Vec2(speed * Math.cos(angle3), speed * Math.sin(angle3)),
            mass: 2,
            radius: 12,
            restitution: 0.3,
            friction: 0.3,
            color: '#f7dc6f',
            label: '30°'
        }));
    }

    _presetPendulum(W, H) {
        const anchor = this.world.addBody(new Body({
            position: new Vec2(W / 2, 60),
            radius: 8,
            isStatic: true,
            color: '#888',
            label: 'Anchor'
        }));

        const bob = this.world.addBody(new Body({
            position: new Vec2(W / 2 + 200, 60),
            mass: 3,
            radius: 25,
            restitution: 0.0,
            friction: 0.0,
            color: '#bb86fc',
            label: 'Bob'
        }));

        const restLen = anchor.position.distanceTo(bob.position);
        this.world.addSpring(new Spring(anchor, bob, restLen, 800, 2));
    }

    _presetNewtonCradle(W, H) {
        const count = 5;
        const r = 20;
        const spacing = r * 2 + 1;
        const startX = W / 2 - (count / 2) * spacing;
        const anchorY = 100;
        const ropeLen = 200;

        for (let i = 0; i < count; i++) {
            const x = startX + i * spacing;

            const anchor = this.world.addBody(new Body({
                position: new Vec2(x, anchorY),
                radius: 4,
                isStatic: true,
                color: '#555',
            }));

            let ballX = x;
            let ballY = anchorY + ropeLen;

            if (i === 0) {
                const pullAngle = Math.PI / 4;
                ballX = x - ropeLen * Math.sin(pullAngle);
                ballY = anchorY + ropeLen * Math.cos(pullAngle);
            }

            const ball = this.world.addBody(new Body({
                position: new Vec2(ballX, ballY),
                mass: 1,
                radius: r,
                restitution: 1.0,
                friction: 0.0,
                color: i === 0 ? '#ff6b6b' : '#90caf9',
            }));

            this.world.addSpring(new Spring(anchor, ball, ropeLen, 1500, 3));
        }
    }

    _presetBilliards(W, H) {
        this.world.gravity = new Vec2(0, 0);
        document.getElementById('slider-gravity').value = 0;
        document.getElementById('val-gravity').textContent = '0.0';

        this.world.airDrag = 0.003;
        document.getElementById('slider-drag').value = 0.003;
        document.getElementById('val-drag').textContent = '0.003';

        const r = 15;
        const cx = W / 2 + 100;
        const cy = H / 2;

        let idx = 0;
        const colors = ['#ff6b6b', '#f7dc6f', '#4ecdc4', '#bb86fc', '#ff8a65',
            '#4fc3f7', '#a5d6a7', '#f48fb1', '#80cbc4', '#90caf9',
            '#ffab91', '#ce93d8', '#81d4fa', '#c5e1a5', '#ef9a9a'];

        for (let i = 0; i < 5; i++) {
            for (let j = 0; j <= i; j++) {
                const x = cx + i * (r * 2 - 2);
                const y = cy - i * r + j * (r * 2);
                this.world.addBody(new Body({
                    position: new Vec2(x, y),
                    mass: 1,
                    radius: r,
                    restitution: 0.95,
                    friction: 0.1,
                    color: colors[idx % colors.length],
                }));
                idx++;
            }
        }

        this.world.addBody(new Body({
            position: new Vec2(200, cy),
            velocity: new Vec2(800, 0),
            mass: 1,
            radius: r,
            restitution: 0.95,
            friction: 0.1,
            color: '#ffffff',
            label: 'Cue'
        }));
    }

    _presetStacking(W, H) {
        this.world.addBody(new Body({
            position: new Vec2(W / 2, H - 15),
            shape: Shape.RECT,
            width: W,
            height: 30,
            isStatic: true,
            color: '#3d405b',
        }));

        const boxW = 50;
        const boxH = 40;
        const startX = W / 2;
        const startY = H - 30 - boxH / 2;

        for (let row = 0; row < 6; row++) {
            const boxesInRow = 6 - row;
            const rowStartX = startX - (boxesInRow * boxW) / 2 + boxW / 2;
            for (let col = 0; col < boxesInRow; col++) {
                this.world.addBody(new Body({
                    position: new Vec2(rowStartX + col * boxW, startY - row * boxH),
                    shape: Shape.RECT,
                    width: boxW - 2,
                    height: boxH - 2,
                    mass: 1,
                    restitution: 0.1,
                    friction: 0.6,
                    color: nextColor(),
                }));
            }
        }

        this.world.addBody(new Body({
            position: new Vec2(100, H / 2 - 100),
            velocity: new Vec2(400, 0),
            mass: 5,
            radius: 25,
            restitution: 0.3,
            friction: 0.3,
            color: '#ff6b6b',
            label: 'Wrecking'
        }));
    }

    _presetGyroscope(W, H) {
        this.world.addBody(new Body({
            position: new Vec2(W / 2, H - 15),
            shape: Shape.RECT,
            width: W,
            height: 30,
            isStatic: true,
            color: '#3d405b'
        }));

        const gyro = this.world.addBody(new Body({
            position: new Vec2(W / 2, H - 200),
            shape: Shape.RECT,
            width: 150,
            height: 20,
            mass: 5,
            restitution: 0.0,
            friction: 0.8,
            color: '#f7dc6f',
            label: 'Gyro',
            angularVelocity: 30
        }));

        this.world.addBody(new Body({
            position: new Vec2(W / 2 + 50, H - 400),
            shape: Shape.CIRCLE,
            radius: 20,
            mass: 2,
            restitution: 0.2,
            friction: 0.5,
            color: '#ff6b6b',
            label: 'Weight'
        }));
    }

    _presetDoublePendulum(W, H) {
        import('./physics.js').then(({ RevoluteJoint }) => {
            const anchorPoint = new Vec2(W / 2, 80);
            
            const anchor = this.world.addBody(new Body({
                position: anchorPoint,
                radius: 10,
                isStatic: true,
                color: '#888',
                label: 'Anchor'
            }));

            const arm1 = this.world.addBody(new Body({
                position: new Vec2(W / 2 + 70, 80),
                shape: Shape.RECT,
                width: 140,
                height: 10,
                mass: 2,
                color: '#4ecdc4',
            }));

            const bob1 = this.world.addBody(new Body({
                position: new Vec2(W / 2 + 140, 80),
                radius: 15,
                mass: 3,
                color: '#ff6b6b',
                label: 'Bob 1'
            }));

            const arm2 = this.world.addBody(new Body({
                position: new Vec2(W / 2 + 140 + 70, 80),
                shape: Shape.RECT,
                width: 140,
                height: 10,
                mass: 2,
                color: '#90caf9',
            }));
            
            const bob2 = this.world.addBody(new Body({
                position: new Vec2(W / 2 + 280, 80),
                radius: 15,
                mass: 3,
                color: '#bb86fc',
                label: 'Bob 2'
            }));

            this.world.addJoint(new RevoluteJoint(anchor, arm1, anchorPoint));
            this.world.addJoint(new RevoluteJoint(arm1, bob1, bob1.position));
            this.world.addJoint(new RevoluteJoint(bob1, arm2, bob1.position));
            this.world.addJoint(new RevoluteJoint(arm2, bob2, bob2.position));
        });
    }

    _presetInvertedPendulum(W, H) {
        import('./physics.js').then(({ RevoluteJoint }) => {
            this.world.addBody(new Body({
                position: new Vec2(W / 2, H - 30),
                shape: Shape.RECT,
                width: W,
                height: 60,
                isStatic: true,
                friction: 0.1,
                color: '#3d405b'
            }));

            const cart = this.world.addBody(new Body({
                position: new Vec2(W / 2, H - 85),
                shape: Shape.RECT,
                width: 100,
                height: 50,
                mass: 10,
                friction: 0.1,
                color: '#a5d6a7',
                label: 'Cart',
                velocity: new Vec2(200, 0)
            }));

            const pole = this.world.addBody(new Body({
                position: new Vec2(W / 2, H - 85 - 100),
                shape: Shape.RECT,
                width: 10,
                height: 200,
                mass: 1,
                color: '#f48fb1',
                angle: 0.1
            }));

            const head = this.world.addBody(new Body({
                position: new Vec2(W / 2 + Math.sin(0.1)*100, H - 85 - 200),
                radius: 20,
                mass: 4,
                color: '#ff6b6b'
            }));

            this.world.addJoint(new RevoluteJoint(cart, pole, cart.position));
            this.world.addJoint(new RevoluteJoint(pole, head, pole.position.sub(new Vec2(0, 100))));
        });
    }

    // ─── Helpers ──────────────────────────────────────────────
    _mousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return new Vec2(e.clientX - rect.left, e.clientY - rect.top);
    }

    _resizeCanvas() {
        if (this.embedMode) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        } else {
            const sidebarWidth = this.sidebar ? this.sidebar.offsetWidth : 0;
            this.canvas.width = window.innerWidth - sidebarWidth;
            this.canvas.height = window.innerHeight;
        }
    }

    _updatePlayPauseBtn() {
        document.getElementById('btn-play').classList.toggle('active', this.running);
        document.getElementById('btn-pause').classList.toggle('active', !this.running);
    }

    _updateInfoPanel() {
        const panel = document.getElementById('body-info');
        const actions = document.getElementById('body-actions');
        
        if (!this.selectedBody) {
            panel.innerHTML = '<p class="info-hint">Right-click a body to inspect</p>';
            if (actions) actions.style.display = 'none';
            return;
        }
        
        if (actions) actions.style.display = 'flex';
        
        const b = this.selectedBody;
        panel.innerHTML = `
            <div class="info-row"><span>ID</span><span>#${b.id}</span></div>
            <div class="info-row"><span>Shape</span><span>${b.shape}</span></div>
            <div class="info-row"><span>Mass</span><span>${b.isStatic ? '∞ (static)' : b.mass.toFixed(1) + ' kg'}</span></div>
            <div class="info-row"><span>Position</span><span>${b.position.toString()}</span></div>
            <div class="info-row"><span>Velocity</span><span>${b.velocity.toString()}</span></div>
            <div class="info-row"><span>Speed</span><span>${b.speed().toFixed(1)} px/s</span></div>
            <div class="info-row"><span>Momentum</span><span>${b.momentum().toString()}</span></div>
            <div class="info-row"><span>KE</span><span>${b.kineticEnergy().toFixed(1)}</span></div>
            <div class="info-row"><span>Restitution</span><span>${b.restitution.toFixed(2)}</span></div>
            <div class="info-row"><span>Friction μ</span><span>${b.friction.toFixed(2)}</span></div>
        `;
        
        const btnFreeze = document.getElementById('btn-body-freeze');
        if (btnFreeze) {
            btnFreeze.innerHTML = b.isStatic ? '<span class="btn-icon">🔥</span> Unfreeze' : '<span class="btn-icon">❄️</span> Freeze';
        }
    }
}

// ─── Bootstrap ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    new App();
});
