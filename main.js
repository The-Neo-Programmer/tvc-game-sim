// ============================================================
// TVC SIM v1 — Main Application Loop
// ============================================================

const APP = (() => {
    let simState = 'PREFLIGHT'; // PREFLIGHT | BOOT | ORBITAL | FLIGHT | PAUSED
    let paused = false;
    let simSpeed = 1.0;
    let hoverTarget = null;
    let lastTime = null;
    let glitchTimer = 0;
    let logLines = [];
    const MAX_LOG = 120;
    let graphLabel = 'pitch';
    let trajectory = [];
    let trajTimer = 0;
    const TRAJ_INTERVAL = 0.5; // seconds

    // ── Log ──────────────────────────────────────────────────
    function log(msg, type = 'log') {
        const ts = PHYSICS.getState().launched
            ? `T+${PHYSICS.getState().missionTime.toFixed(1).padStart(6)}s`
            : 'PRE-FLT';
        const line = `[${ts}] ${msg}`;
        logLines.push({ text: line, type });
        if (logLines.length > MAX_LOG) logLines.shift();
        renderLog();
    }

    function renderLog() {
        const el = document.getElementById('terminal-log');
        if (!el) return;
        el.innerHTML = logLines.map(l =>
            `<div class="log-line ${l.type}">${escHtml(l.text)}</div>`
        ).join('');
        el.scrollTop = el.scrollHeight;
    }

    function escHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Boot Sequence ─────────────────────────────────────────
    function runBoot() {
        const bootEl = document.getElementById('boot-text');
        const overlay = document.getElementById('boot-overlay');
        const lines = [
            'TVC_SIM v1.0 ONLINE',
            '> INITIALIZING PHYSICS ENGINE...',
            '> PID CONTROLLER: STANDBY',
            '> TRAJECTORY PREDICTOR: READY',
            '> SENSOR ARRAY: NOMINAL',
            '> GIMBAL ACTUATORS: NOMINAL',
            '> FUEL SYSTEM: PRESSURIZED',
            '> ALL SYSTEMS GO',
            '',
            'PRESS [SPACE] TO BEGIN OR USE "LAUNCH" COMMAND',
        ];

        let lineIdx = 0, charIdx = 0;
        let currentText = '';
        bootEl.textContent = '';

        function typeNext() {
            if (lineIdx >= lines.length) {
                // Done — wait then fade
                setTimeout(() => {
                    overlay.classList.add('fade-out');
                    setTimeout(() => {
                        overlay.style.display = 'none';
                        simState = 'ORBITAL';
                        log('TVC_SIM v1.0 ONLINE — AWAITING LAUNCH COMMAND', 'sys');
                        log('Type HELP for command list or click [LAUNCH]', 'info');
                    }, 900);
                }, 800);
                return;
            }
            const line = lines[lineIdx];
            if (charIdx < line.length) {
                currentText += line[charIdx++];
                bootEl.innerHTML = currentText.split('\n').join('\n') + '<span id="boot-cursor"></span>';
                bootEl.style.whiteSpace = 'pre';
                setTimeout(typeNext, 28);
            } else {
                currentText += '\n';
                lineIdx++;
                charIdx = 0;
                setTimeout(typeNext, lineIdx < lines.length ? 80 : 300);
            }
        }
        typeNext();
    }

    // ── Sim Control ───────────────────────────────────────────
    function togglePause() {
        if (!PHYSICS.getState().launched) return;
        paused = !paused;
        if (paused) {
            log('SIM PAUSED — DRAG TO ROTATE ROCKET — PRESS [SPACE] TO RESUME', 'warn');
            document.getElementById('pause-hint').style.display = 'block';
            RENDERER.setTargetZoom(RENDERER.getZoom() * 1.6);
        } else {
            log('SIM RESUMED — PID CORRECTING ATTITUDE...', 'sys');
            document.getElementById('pause-hint').style.display = 'none';
        }
    }

    function resetSim() {
        const cfg = gatherPreflightConfig();
        PHYSICS.reset(cfg);
        RENDERER.resetParticles();
        paused = false;
        simState = 'ORBITAL';
        trajectory = [];
        RENDERER.setTargetZoom(0.8);
        RENDERER.panTo(0, 0);
        document.getElementById('pause-hint').style.display = 'none';
        log('SIMULATION RESET — PRE-FLIGHT MODE', 'sys');
        UI.syncSlidersToState();
    }

    function setSimState(s) { simState = s; }
    function setSimSpeed(s) { simSpeed = Math.max(0.1, Math.min(10, s)); }
    function getSimSpeed() { return simSpeed; }
    function isPaused() { return paused; }

    function setHoverTarget(alt) {
        hoverTarget = alt;
        log(`MISSION: HOVER TARGET SET TO ${alt}m`, 'sys');
    }

    function gatherPreflightConfig() {
        return {
            mass: parseFloat(document.getElementById('pf-mass')?.value) || 30,
            fuelMass: parseFloat(document.getElementById('pf-fuel')?.value) || 15,
            momentArm: parseFloat(document.getElementById('pf-arm')?.value) || 0.5,
            maxThrust: parseFloat(document.getElementById('pf-thrust')?.value) || 800,
            gimbalLimit: parseFloat(document.getElementById('pf-gimbal-lim')?.value) || 20,
            gravity: parseFloat(document.getElementById('pf-gravity')?.value) || 9.81,
        };
    }

    // Hover mission logic
    function applyHoverLogic() {
        if (hoverTarget === null) return;
        const s = PHYSICS.getState();
        if (s.mode !== 'auto') return;
        const altError = hoverTarget - s.altitude;
        // Adjust target pitch & throttle to achieve hover
        const targetThrottle = 0.5 + altError * 0.003;
        const clampedT = Math.max(0.1, Math.min(1, targetThrottle));
        PHYSICS.setThrottle(clampedT);
    }

    // ── Telemetry Logging ─────────────────────────────────────
    let telemTimer = 0;
    function logTelemetry(state) {
        telemTimer += 0.016;
        if (telemTimer < 2) return;
        telemTimer = 0;
        log(
            `ALT:${state.altitude.toFixed(0)}m SPD:${state.speed.toFixed(1)}m/s PITCH:${(state.angle * 180 / Math.PI).toFixed(1)}° GMB:${state.gimbalX.toFixed(1)}° FUEL:${state.fuelMass.toFixed(1)}kg`,
            'telemetry'
        );
        if (Math.abs(state.gimbalX) > 1 && state.mode === 'auto') {
            log(`ATTITUDE CORRECTING: GIMBAL_X=${state.gimbalX.toFixed(2)}°`, 'info');
        }
    }

    // ── Glitch FX ────────────────────────────────────────────
    function maybeGlitch() {
        if (Math.random() < 0.002) {
            const body = document.body;
            body.classList.add('glitch-effect');
            setTimeout(() => body.classList.remove('glitch-effect'), 150);
        }
    }

    // ── Main Loop ────────────────────────────────────────────
    function animate(timestamp) {
        if (!lastTime) lastTime = timestamp;
        let rawDt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;
        rawDt = Math.min(rawDt, 0.1); // cap dt to avoid spiral

        const dt = rawDt * simSpeed;

        CONTROLS.processKeys();

        if (!paused && simState === 'FLIGHT') {
            applyHoverLogic();
            PHYSICS.update(dt);

            // Trajectory predict every interval
            trajTimer += rawDt;
            if (trajTimer >= TRAJ_INTERVAL) {
                trajTimer = 0;
                trajectory = PHYSICS.predictTrajectory(300, 0.05);
            }

            const state = PHYSICS.getState();
            logTelemetry(state);
            UI.updateWarnings(state);
            UI.syncSlidersToState();
            maybeGlitch();
        } else if (simState === 'ORBITAL' || simState === 'PREFLIGHT') {
            // Show predicted trajectory before launch
            trajTimer += rawDt;
            if (trajTimer >= TRAJ_INTERVAL * 2) {
                trajTimer = 0;
                trajectory = PHYSICS.predictTrajectory(200, 0.05);
            }
        }

        // Render
        RENDERER.render(
            PHYSICS.getState(),
            PHYSICS.getConfig(),
            PHYSICS.getHistory(),
            trajectory,
            paused,
            paused ? CONTROLS.getMouseAngle() : null,
            simSpeed,
            UI.getGraphLabel()
        );

        requestAnimationFrame(animate);
    }

    // ── Startup ──────────────────────────────────────────────
    function start() {
        const canvas = document.getElementById('sim-canvas');
        const miniGraph = document.getElementById('graph-canvas');

        RENDERER.init(canvas, miniGraph);
        PHYSICS.init();
        CONTROLS.init(
            document.getElementById('cmd-input'),
            canvas,
            (msg, type) => log(msg, type)
        );

        // Wire up all sliders
        bindSlider('sl-gimbal-x', -30, 30, 0, (v) => {
            PHYSICS.setGimbalX(v);
        }, (v) => `${v.toFixed(1)}°`);

        bindSlider('sl-throttle', 0, 100, 0, (v) => {
            PHYSICS.setThrottle(v / 100);
        }, (v) => `${v.toFixed(0)}%`);

        bindSlider('sl-kp', 0, 10, 2.0, (v) => {
            const p = PHYSICS.getPID();
            PHYSICS.setPID(v, p.ki, p.kd);
        }, (v) => v.toFixed(2));

        bindSlider('sl-ki', 0, 1, 0.05, (v) => {
            const p = PHYSICS.getPID();
            PHYSICS.setPID(p.kp, v, p.kd);
        }, (v) => v.toFixed(3));

        bindSlider('sl-kd', 0, 5, 0.8, (v) => {
            const p = PHYSICS.getPID();
            PHYSICS.setPID(p.kp, p.ki, v);
        }, (v) => v.toFixed(2));

        bindSlider('sl-speed', 0.1, 10, 1, (v) => {
            setSimSpeed(v);
        }, (v) => `×${v.toFixed(1)}`);

        bindSlider('sl-zoom', 0.05, 8, 0.8, (v) => {
            RENDERER.setTargetZoom(v);
        }, (v) => v.toFixed(2));

        bindSlider('sl-wind-str', 0, 20, 3, (v) => {
            PHYSICS.setWindStrength(v);
        }, (v) => `${v.toFixed(1)}m/s`);

        bindSlider('sl-target', -30, 30, 0, (v) => {
            PHYSICS.setTargetAngle(v * Math.PI / 180);
        }, (v) => `${v.toFixed(1)}°`);

        // Buttons
        document.getElementById('btn-launch')?.addEventListener('click', () => {
            const cfg = gatherPreflightConfig();
            PHYSICS.setConfig(cfg);
            PHYSICS.launch();
            setSimState('FLIGHT');
            log('IGNITION — MAIN ENGINE START', 'sys');
            RENDERER.setTargetZoom(1.5);
        });

        document.getElementById('btn-pause')?.addEventListener('click', togglePause);
        document.getElementById('btn-reset')?.addEventListener('click', resetSim);

        document.getElementById('btn-mode-manual')?.addEventListener('click', () => {
            PHYSICS.setMode('manual');
            UI.syncSlidersToState();
            log('MODE: MANUAL CONTROL', 'sys');
        });
        document.getElementById('btn-mode-auto')?.addEventListener('click', () => {
            PHYSICS.setMode('auto');
            UI.syncSlidersToState();
            log('MODE: AUTO-STABLE (PID ACTIVE)', 'sys');
        });

        document.getElementById('btn-wind')?.addEventListener('click', () => {
            const cfg = PHYSICS.getConfig();
            PHYSICS.setWindEnabled(!cfg.windEnabled);
            UI.syncSlidersToState();
            log(`WIND: ${cfg.windEnabled ? 'DISABLED' : 'ENABLED'}`, 'info');
        });

        // Graph selector
        document.querySelectorAll('[data-graph]').forEach(btn => {
            btn.addEventListener('click', () => {
                UI.setGraphLabel(btn.dataset.graph);
                document.querySelectorAll('[data-graph]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Preflight launch
        document.getElementById('btn-pf-launch')?.addEventListener('click', () => {
            const cfg = gatherPreflightConfig();
            PHYSICS.reset(cfg);
            PHYSICS.launch();
            setSimState('FLIGHT');
            document.getElementById('preflight-panel').classList.add('hidden');
            log('PRE-FLIGHT CONFIG APPLIED — LAUNCH SEQUENCE INITIATED', 'sys');
            RENDERER.setTargetZoom(1.5);
        });
        document.getElementById('btn-pf-cancel')?.addEventListener('click', () => {
            document.getElementById('preflight-panel').classList.add('hidden');
        });
        document.getElementById('btn-preflight')?.addEventListener('click', () => {
            document.getElementById('preflight-panel').classList.remove('hidden');
        });

        // Command reference
        document.getElementById('cmd-help-btn')?.addEventListener('click', () => UI.showCmdRef());
        document.getElementById('cmd-ref-close')?.addEventListener('click', () => UI.hideCmdRef());

        // Build command reference table
        buildCmdRefTable();

        // Initial PID defaults
        PHYSICS.setPID(2.0, 0.05, 0.8);
        RENDERER.setTargetZoom(0.8);

        UI.syncSlidersToState();

        // Start boot sequence
        runBoot();
        requestAnimationFrame(animate);
    }

    function bindSlider(id, min, max, defaultVal, onChange, fmt) {
        const el = document.getElementById(id);
        const valEl = document.getElementById(id + '-val');
        if (!el) return;
        el.min = min; el.max = max; el.step = (max - min) / 1000;
        el.value = defaultVal;
        if (valEl) valEl.textContent = fmt ? fmt(defaultVal) : defaultVal;
        el.addEventListener('input', () => {
            const v = parseFloat(el.value);
            onChange(v);
            if (valEl) valEl.textContent = fmt ? fmt(v) : v;
        });
    }

    function buildCmdRefTable() {
        const tbody = document.getElementById('cmd-table-body');
        if (!tbody) return;
        const defs = CONTROLS.getCommandDefs();
        tbody.innerHTML = Object.entries(defs).map(([name, def]) =>
            `<tr><td>${name}</td><td>${escHtml(def.desc)}</td></tr>`
        ).join('');
    }

    return {
        start, togglePause, resetSim, setSimState,
        isPaused, setSimSpeed, getSimSpeed, setHoverTarget,
        log,
    };
})();

// ── Entry Point ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => APP.start());
