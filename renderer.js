// ============================================================
// TVC SIM v1 — Renderer (Canvas 2D)
// ============================================================

const RENDERER = (() => {
    let canvas, ctx, graphCanvas, graphCtx;

    // Camera
    let camX = 0, camY = 0;
    let targetCamX = 0, targetCamY = 0;
    let zoom = 1, targetZoom = 1;

    // Particle system
    const particles = [];

    // History ring for graph
    const graphHistory = { pitch: [], speed: [], altitude: [] };
    const GRAPH_LEN = 200;

    // Colors
    const C = {
        green: '#00ff41',
        greenDim: '#00b32c',
        amber: '#ffaa00',
        red: '#ff2222',
        blue: '#00aaff',
        white: '#ccffcc',
        bg: '#000000',
    };

    function init(simCanvas, miniGraphCanvas) {
        canvas = simCanvas;
        ctx = canvas.getContext('2d');
        graphCanvas = miniGraphCanvas;
        graphCtx = graphCanvas.getContext('2d');
        resize();
    }

    function resize() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        graphCanvas.width = graphCanvas.offsetWidth;
        graphCanvas.height = graphCanvas.offsetHeight;
    }

    // ---- Camera ----
    function setTargetZoom(z) { targetZoom = Math.max(0.04, Math.min(12, z)); }
    function getZoom() { return zoom; }
    function panTo(wx, wy) { targetCamX = wx; targetCamY = wy; }

    function lerpCamera() {
        const alpha = 0.06;
        zoom += (targetZoom - zoom) * alpha;
        camX += (targetCamX - camX) * alpha;
        camY += (targetCamY - camY) * alpha;
    }

    // World → screen transform
    function worldToScreen(wx, wy) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        // y is flipped (screen y increases downward)
        return {
            sx: cx + (wx - camX) * zoom,
            sy: cy - (wy - camY) * zoom,
        };
    }

    // ---- Particle System ----
    function spawnFlameParticles(wx, wy, angle, thrustRatio) {
        const count = Math.floor(thrustRatio * 6);
        for (let i = 0; i < count; i++) {
            const spread = (Math.random() - 0.5) * 0.4;
            const speed = (1 + Math.random() * 2) * thrustRatio * 3;
            // Exhaust shoots opposite to thrust direction
            const exhaust = angle + Math.PI + spread;
            particles.push({
                x: wx, y: wy,
                vx: Math.sin(exhaust) * speed,
                vy: Math.cos(exhaust) * speed,
                life: 1.0,
                decay: 0.05 + Math.random() * 0.06,
                r: 2 + Math.random() * 3,
                type: 'flame',
            });
        }
    }

    function spawnSmokeParticles(wx, wy) {
        if (Math.random() > 0.3) return;
        particles.push({
            x: wx + (Math.random() - 0.5) * 0.5,
            y: wy,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -(0.2 + Math.random() * 0.5),
            life: 1.0,
            decay: 0.015 + Math.random() * 0.02,
            r: 4 + Math.random() * 8,
            type: 'smoke',
        });
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.type === 'flame') p.vy -= 0.5 * dt; // slight gravity on exhaust
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const { sx, sy } = worldToScreen(p.x, p.y);
            const r = p.r * zoom;
            if (r < 0.5) continue;
            ctx.save();
            ctx.globalAlpha = p.life * 0.85;
            if (p.type === 'flame') {
                const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
                grad.addColorStop(0, '#ffffff');
                grad.addColorStop(0.3, '#ffaa00');
                grad.addColorStop(0.7, '#ff4400');
                grad.addColorStop(1, 'rgba(255,0,0,0)');
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = `rgba(60,80,60,${p.life * 0.4})`;
            }
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(0.5, r), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ---- Earth ----
    function drawEarth(state) {
        const earthRadius = 6371000; // m
        // We use a scaled representation
        const displayRadius = Math.max(canvas.width, canvas.height) * 2.5;
        const { sx, sy } = worldToScreen(0, -earthRadius * 0.0001 * (canvas.height / zoom));
        // Earth arc at bottom
        const groundY = worldToScreen(0, 0).sy;
        if (groundY > canvas.height + 100) return; // off screen

        // Atmosphere gradient
        const atmH = 80; // px
        const atmGrad = ctx.createLinearGradient(0, groundY - atmH, 0, groundY);
        atmGrad.addColorStop(0, 'rgba(0,60,120,0)');
        atmGrad.addColorStop(1, 'rgba(0,80,160,0.3)');
        ctx.fillStyle = atmGrad;
        ctx.fillRect(0, groundY - atmH, canvas.width, atmH);

        // Ground
        const gGrad = ctx.createLinearGradient(0, groundY, 0, groundY + 40);
        gGrad.addColorStop(0, '#003300');
        gGrad.addColorStop(1, '#001a00');
        ctx.fillStyle = gGrad;
        ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY + 10);

        // Ground line
        ctx.strokeStyle = C.greenDim;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(canvas.width, groundY);
        ctx.stroke();

        // Grid lines
        ctx.strokeStyle = 'rgba(0,100,0,0.15)';
        ctx.lineWidth = 1;
        const gridSpacing = Math.max(20, 100 * zoom); // world units
        const screenSpacing = gridSpacing * zoom;
        if (screenSpacing > 15) {
            for (let sx2 = ((canvas.width / 2 - camX * zoom) % screenSpacing + screenSpacing) % screenSpacing;
                sx2 < canvas.width; sx2 += screenSpacing) {
                ctx.beginPath();
                ctx.moveTo(sx2, 0);
                ctx.lineTo(sx2, groundY);
                ctx.stroke();
            }
            const altStep = gridSpacing;
            for (let a = 0; a < 100000; a += altStep) {
                const { sy: lineY } = worldToScreen(0, a);
                if (lineY < 0 || lineY > groundY) continue;
                ctx.beginPath();
                ctx.moveTo(0, lineY);
                ctx.lineTo(canvas.width, lineY);
                ctx.stroke();
                // Altitude label
                if (screenSpacing > 40 && a > 0) {
                    ctx.fillStyle = 'rgba(0,150,0,0.4)';
                    ctx.font = '9px Share Tech Mono, monospace';
                    ctx.fillText(`${(a).toFixed(0)}m`, 4, lineY - 2);
                }
            }
        }

        // Horizon curve (only in orbital view)
        if (zoom < 0.3) {
            const hGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
            hGrad.addColorStop(0, 'rgba(0,10,40,0.9)');
            hGrad.addColorStop(0.7, 'rgba(0,30,80,0.6)');
            hGrad.addColorStop(1, 'rgba(0,80,160,0.2)');
            ctx.fillStyle = hGrad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = 'rgba(0,120,255,0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, groundY + 10);
            ctx.bezierCurveTo(
                canvas.width * 0.1, groundY - 30,
                canvas.width * 0.9, groundY - 30,
                canvas.width, groundY + 10
            );
            ctx.stroke();
        }
    }

    // ---- Launch pad ----
    function drawLaunchPad() {
        const { sx, sy } = worldToScreen(0, 0);
        ctx.fillStyle = '#1a3300';
        ctx.fillRect(sx - 30 * zoom, sy, 60 * zoom, 6 * zoom);
        ctx.fillStyle = C.greenDim;
        ctx.fillRect(sx - 2 * zoom, sy - 8 * zoom, 4 * zoom, 8 * zoom);
        ctx.fillStyle = C.greenDim;
        const padW = 20 * zoom;
        ctx.fillRect(sx - padW, sy - 2 * zoom, padW * 2, 3 * zoom);
        // X marker
        ctx.strokeStyle = C.amber;
        ctx.lineWidth = 1;
        const m = 4 * zoom;
        ctx.beginPath();
        ctx.moveTo(sx - m, sy - m); ctx.lineTo(sx + m, sy + m);
        ctx.moveTo(sx + m, sy - m); ctx.lineTo(sx - m, sy + m);
        ctx.stroke();
    }

    // ---- Rocket ----
    function drawRocket(state) {
        const { sx, sy } = worldToScreen(state.x, state.y);
        const angle = state.angle; // radians, 0 = pointing up
        const baseH = 18, baseW = 5;
        const H = baseH * zoom;
        const W = baseW * zoom;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle); // positive angle = tilted right

        // Rocket body
        const bodyGrad = ctx.createLinearGradient(-W, -H, W, -H);
        bodyGrad.addColorStop(0, '#004400');
        bodyGrad.addColorStop(0.5, '#00aa44');
        bodyGrad.addColorStop(1, '#004400');
        ctx.fillStyle = bodyGrad;

        // Fuselage
        ctx.beginPath();
        ctx.roundRect(-W / 2, -H, W, H * 0.8, W * 0.2);
        ctx.fill();

        // Nose cone
        ctx.fillStyle = '#00cc55';
        ctx.beginPath();
        ctx.moveTo(-W / 2, -H);
        ctx.lineTo(0, -H - H * 0.4);
        ctx.lineTo(W / 2, -H);
        ctx.closePath();
        ctx.fill();

        // Fins
        ctx.fillStyle = '#008833';
        // Left fin
        ctx.beginPath();
        ctx.moveTo(-W / 2, 0);
        ctx.lineTo(-W * 1.4, H * 0.25);
        ctx.lineTo(-W / 2, -H * 0.2);
        ctx.closePath();
        ctx.fill();
        // Right fin
        ctx.beginPath();
        ctx.moveTo(W / 2, 0);
        ctx.lineTo(W * 1.4, H * 0.25);
        ctx.lineTo(W / 2, -H * 0.2);
        ctx.closePath();
        ctx.fill();

        // Engine nozzle
        ctx.fillStyle = '#555';
        const nW = W * 0.55;
        const nH = H * 0.12;
        ctx.fillRect(-nW / 2, 0, nW, nH);

        // Glow outline
        ctx.strokeStyle = 'rgba(0,255,65,0.5)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-W / 2, -H, W, H * 0.8);

        ctx.restore();
    }

    // ---- Thrust Vector Arrow ----
    function drawThrustVector(state) {
        if (!state.launched || state.throttle < 0.01) return;
        const { sx, sy } = worldToScreen(state.x, state.y);
        const totalAngle = state.angle + (state.gimbalX * Math.PI / 180);
        const len = 30 * zoom * state.throttle;
        const ex = sx + Math.sin(totalAngle) * len;
        const ey = sy - Math.cos(totalAngle) * len;

        ctx.save();
        ctx.strokeStyle = '#ff2222';
        ctx.shadowColor = '#ff2222';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Arrowhead
        const headLen = 6 * zoom;
        const headAngle = Math.atan2(ey - sy, ex - sx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(headAngle - 0.4), ey - headLen * Math.sin(headAngle - 0.4));
        ctx.lineTo(ex - headLen * Math.cos(headAngle + 0.4), ey - headLen * Math.sin(headAngle + 0.4));
        ctx.closePath();
        ctx.fillStyle = '#ff2222';
        ctx.fill();
        ctx.restore();
    }

    // ---- Predicted Trajectory ----
    function drawTrajectoryArc(pts) {
        if (!pts || pts.length < 2) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(0,180,255,0.6)';
        ctx.setLineDash([4 / zoom, 6 / zoom]);
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#00aaff';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        const first = worldToScreen(pts[0].x, pts[0].y);
        ctx.moveTo(first.sx, first.sy);
        for (let i = 1; i < pts.length; i++) {
            const { sx, sy } = worldToScreen(pts[i].x, pts[i].y);
            ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Apex marker
        let maxY = -Infinity, apexPt = null;
        for (const p of pts) { if (p.y > maxY) { maxY = p.y; apexPt = p; } }
        if (apexPt) {
            const { sx, sy } = worldToScreen(apexPt.x, apexPt.y);
            ctx.save();
            ctx.fillStyle = '#00aaff';
            ctx.shadowColor = '#00aaff';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(sx, sy, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = `9px Share Tech Mono, monospace`;
            ctx.fillText(`APEX: ${maxY.toFixed(0)}m`, sx + 6, sy - 4);
            ctx.restore();
        }
    }

    // ---- Historical Trace ----
    function drawFlightTrace(history) {
        if (history.length < 2) return;
        ctx.save();
        ctx.lineWidth = 1;
        ctx.shadowColor = C.green;
        ctx.shadowBlur = 2;
        for (let i = 1; i < history.length; i++) {
            const alpha = i / history.length;
            ctx.strokeStyle = `rgba(0,${Math.floor(180 * alpha)},${Math.floor(65 * alpha)},${alpha * 0.6})`;
            const a = worldToScreen(history[i - 1].x, history[i - 1].y);
            const b = worldToScreen(history[i].x, history[i].y);
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ---- HUD ----
    function drawHUD(state, cfg, paused, simSpeed) {
        const pad = 14;
        const lineH = 18;
        ctx.font = '11px Share Tech Mono, monospace';

        // Right side stats
        const col2 = canvas.width - 200;
        let row = pad + lineH;

        const lines = [
            { label: 'ALT', value: `${state.altitude.toFixed(1)} m`, color: C.green },
            { label: 'SPD', value: `${state.speed.toFixed(1)} m/s`, color: C.green },
            { label: 'PITCH', value: `${(state.angle * 180 / Math.PI).toFixed(2)}°`, color: C.amber },
            { label: 'ANG_V', value: `${(state.angularVel * 180 / Math.PI).toFixed(2)}°/s`, color: C.green },
            { label: 'GMBX', value: `${state.gimbalX.toFixed(2)}°`, color: C.amber },
            { label: 'THROT', value: `${(state.throttle * 100).toFixed(1)}%`, color: C.green },
            { label: 'MASS', value: `${state.mass.toFixed(2)} kg`, color: C.green },
            { label: 'FUEL', value: `${state.fuelMass.toFixed(2)} kg`, color: state.fuelMass < 1 ? C.red : C.green },
            { label: 'MODE', value: state.mode.toUpperCase(), color: state.mode === 'auto' ? C.amber : C.blue },
            { label: 'T+', value: `${state.missionTime.toFixed(1)} s`, color: C.green },
        ];

        for (const l of lines) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(col2 - 4, row - lineH + 3, 188, lineH);
            ctx.fillStyle = C.greenDim;
            ctx.fillText(l.label, col2, row);
            ctx.fillStyle = l.color;
            ctx.shadowColor = l.color;
            ctx.shadowBlur = 4;
            ctx.fillText(l.value, col2 + 56, row);
            ctx.shadowBlur = 0;
            row += lineH;
        }

        // State label
        const stateStr = paused ? '■ PAUSED' : state.launched ? '▶ FLIGHT' : '● STANDBY';
        const stateCol = paused ? C.amber : state.launched ? C.green : C.greenDim;
        ctx.fillStyle = stateCol;
        ctx.shadowColor = stateCol;
        ctx.shadowBlur = 8;
        ctx.font = '12px Share Tech Mono, monospace';
        ctx.fillText(stateStr, pad, pad + 12);
        ctx.shadowBlur = 0;

        // Speed multiplier
        if (simSpeed !== 1) {
            ctx.fillStyle = C.amber;
            ctx.shadowColor = C.amber;
            ctx.shadowBlur = 6;
            ctx.font = '10px Share Tech Mono, monospace';
            ctx.fillText(`SPEED: ×${simSpeed.toFixed(1)}`, pad, canvas.height - 40);
            ctx.shadowBlur = 0;
        }

        // Landed / out of fuel banners
        if (state.landed) {
            ctx.save();
            ctx.font = '20px Share Tech Mono, monospace';
            ctx.fillStyle = C.green;
            ctx.shadowColor = C.green;
            ctx.shadowBlur = 20;
            ctx.textAlign = 'center';
            ctx.fillText('MISSION COMPLETE — LANDED', canvas.width / 2, canvas.height / 2);
            ctx.restore();
        }
        if (state.fuelMass <= 0 && state.launched) {
            ctx.save();
            ctx.font = '13px Share Tech Mono, monospace';
            ctx.fillStyle = C.amber;
            ctx.shadowColor = C.amber;
            ctx.shadowBlur = 8;
            ctx.textAlign = 'center';
            ctx.fillText('FUEL DEPLETED — BALLISTIC', canvas.width / 2, 60);
            ctx.restore();
        }
    }

    // ---- Pause Drag Handle ----
    function drawPauseOverlay(state, mouseAngle) {
        if (mouseAngle === null) return;
        const { sx, sy } = worldToScreen(state.x, state.y);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,170,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(sx, sy, 60 * zoom, 0, Math.PI * 2);
        ctx.stroke();
        // Arrow
        const ax2 = sx + Math.sin(mouseAngle) * 55 * zoom;
        const ay2 = sy - Math.cos(mouseAngle) * 55 * zoom;
        ctx.strokeStyle = C.amber;
        ctx.shadowColor = C.amber;
        ctx.shadowBlur = 10;
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ax2, ay2);
        ctx.stroke();
        ctx.fillStyle = C.amber;
        ctx.font = '10px Share Tech Mono, monospace';
        ctx.fillText('DRAG TO ROTATE', sx - 55 * zoom, sy + 75 * zoom);
        ctx.restore();
    }

    // ---- Mini Graph ----
    function updateGraph(state) {
        graphHistory.pitch.push(state.angle * 180 / Math.PI);
        graphHistory.speed.push(state.speed);
        graphHistory.altitude.push(state.altitude);
        if (graphHistory.pitch.length > GRAPH_LEN) {
            graphHistory.pitch.shift();
            graphHistory.speed.shift();
            graphHistory.altitude.shift();
        }
    }

    function drawGraph(label) {
        const gw = graphCanvas.width, gh = graphCanvas.height;
        graphCtx.clearRect(0, 0, gw, gh);
        graphCtx.fillStyle = 'rgba(0,10,0,0.8)';
        graphCtx.fillRect(0, 0, gw, gh);

        const data = graphHistory[label] || graphHistory.pitch;
        if (data.length < 2) return;

        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;

        graphCtx.strokeStyle = C.green;
        graphCtx.shadowColor = C.green;
        graphCtx.shadowBlur = 4;
        graphCtx.lineWidth = 1.5;
        graphCtx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const gx = (i / (GRAPH_LEN - 1)) * gw;
            const gy = gh - ((data[i] - min) / range) * (gh - 4) - 2;
            if (i === 0) graphCtx.moveTo(gx, gy);
            else graphCtx.lineTo(gx, gy);
        }
        graphCtx.stroke();

        // Zero line
        const zeroY = gh - ((0 - min) / range) * (gh - 4) - 2;
        graphCtx.strokeStyle = 'rgba(0,100,0,0.5)';
        graphCtx.shadowBlur = 0;
        graphCtx.lineWidth = 0.5;
        graphCtx.beginPath();
        graphCtx.moveTo(0, zeroY);
        graphCtx.lineTo(gw, zeroY);
        graphCtx.stroke();

        // Current value label
        const lastVal = data[data.length - 1];
        graphCtx.fillStyle = C.amber;
        graphCtx.font = '9px Share Tech Mono, monospace';
        graphCtx.fillText(`${lastVal.toFixed(1)}`, gw - 36, 10);
    }

    // ---- Stars (orbital view) ----
    const stars = Array.from({ length: 120 }, () => ({
        x: Math.random(), y: Math.random(),
        s: Math.random() * 1.5 + 0.3,
        a: Math.random() * 0.8 + 0.2,
    }));

    function drawStars() {
        ctx.save();
        for (const s of stars) {
            ctx.fillStyle = `rgba(200,255,200,${s.a})`;
            ctx.beginPath();
            ctx.arc(s.x * canvas.width, s.y * canvas.height, s.s, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // ---- Main Frame Render ----
    function render(state, cfg, history, trajectory, paused, mouseAngle, simSpeed, graphLabel) {
        const W = canvas.width, H = canvas.height;

        // Update camera to track rocket
        if (state.launched) {
            panTo(state.x, state.y - (H / 2) / zoom * 0.3);
        } else {
            panTo(0, (H * 0.3) / zoom);
        }
        lerpCamera();

        // Background
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, W, H);

        if (zoom < 0.2) drawStars();

        // World elements
        drawEarth(state);
        drawLaunchPad();
        if (state.launched) drawFlightTrace(history);
        drawTrajectoryArc(trajectory);

        // Particles
        if (state.launched && !paused) {
            if (state.throttle > 0.01 && state.fuelMass > 0) {
                const nozzleAngle = state.angle + Math.PI;
                const nozzleX = state.x + Math.sin(state.angle) * 1;
                const nozzleY = state.y - Math.cos(state.angle) * 1;
                spawnFlameParticles(nozzleX, nozzleY, state.angle, state.throttle);
                spawnSmokeParticles(nozzleX, nozzleY);
            }
        }
        updateParticles(0.016);
        drawParticles();

        drawRocket(state);
        drawThrustVector(state);

        if (paused) drawPauseOverlay(state, mouseAngle);

        drawHUD(state, cfg, paused, simSpeed);

        // Graph
        if (state.launched) updateGraph(state);
        drawGraph(graphLabel);
    }

    return {
        init, resize, render,
        setTargetZoom, getZoom, panTo,
        worldToScreen,
        resetParticles: () => particles.splice(0),
    };
})();
