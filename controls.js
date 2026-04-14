// ============================================================
// TVC SIM v1 — Controls & Command Parser
// ============================================================

const CONTROLS = (() => {
    let cmdInput, logCallback;
    const keyState = {};
    let mouseAngle = null; // for pause-drag
    let isDragging = false;
    let simCanvas;

    // Key → action map
    const KEY_ACTIONS = {
        'ArrowLeft': () => { PHYSICS.setGimbalX(PHYSICS.getState().gimbalX - 1); },
        'ArrowRight': () => { PHYSICS.setGimbalX(PHYSICS.getState().gimbalX + 1); },
        'ArrowUp': () => { PHYSICS.setThrottle(PHYSICS.getState().throttle + 0.04); },
        'ArrowDown': () => { PHYSICS.setThrottle(PHYSICS.getState().throttle - 0.04); },
        'w': () => { PHYSICS.setThrottle(PHYSICS.getState().throttle + 0.04); },
        's': () => { PHYSICS.setThrottle(PHYSICS.getState().throttle - 0.04); },
        'a': () => { PHYSICS.setGimbalX(PHYSICS.getState().gimbalX - 1); },
        'd': () => { PHYSICS.setGimbalX(PHYSICS.getState().gimbalX + 1); },
    };

    // Command definitions
    const COMMANDS = {
        'LAUNCH': {
            desc: 'Launch the rocket (starts simulation)',
            fn: () => {
                PHYSICS.launch();
                APP.setSimState('FLIGHT');
                return 'SYS: IGNITION SEQUENCE INITIATED';
            }
        },
        'PAUSE_SIM': { desc: 'Pause the simulation', fn: () => { APP.togglePause(); return 'SYS: SIM PAUSED'; } },
        'RESUME_SIM': { desc: 'Resume the simulation', fn: () => { APP.togglePause(); return 'SYS: SIM RESUMED'; } },
        'RESET_SIM': { desc: 'Reset simulation to pre-flight', fn: () => { APP.resetSim(); return 'SYS: SIMULATION RESET'; } },
        'GIMBAL_X': { desc: 'Set gimbal X deflection (deg). E.g. GIMBAL_X=5', fn: (v) => { PHYSICS.setGimbalX(parseFloat(v)); UI.syncSlidersToState(); return `SET: GIMBAL_X=${v}`; } },
        'GIMBAL_Y': { desc: 'Set gimbal Y deflection (deg). E.g. GIMBAL_Y=5', fn: (v) => { PHYSICS.setGimbalY(parseFloat(v)); return `SET: GIMBAL_Y=${v}`; } },
        'THROTTLE': { desc: 'Set throttle 0-100. E.g. THROTTLE=80', fn: (v) => { PHYSICS.setThrottle(parseFloat(v) / 100); UI.syncSlidersToState(); return `SET: THROTTLE=${v}%`; } },
        'KP': { desc: 'Set PID proportional gain. E.g. KP=2.0', fn: (v) => { const p = PHYSICS.getPID(); PHYSICS.setPID(parseFloat(v), p.ki, p.kd); UI.syncSlidersToState(); return `SET: KP=${v}`; } },
        'KI': { desc: 'Set PID integral gain. E.g. KI=0.1', fn: (v) => { const p = PHYSICS.getPID(); PHYSICS.setPID(p.kp, parseFloat(v), p.kd); UI.syncSlidersToState(); return `SET: KI=${v}`; } },
        'KD': { desc: 'Set PID derivative gain. E.g. KD=0.8', fn: (v) => { const p = PHYSICS.getPID(); PHYSICS.setPID(p.kp, p.ki, parseFloat(v)); UI.syncSlidersToState(); return `SET: KD=${v}`; } },
        'ZOOM': { desc: 'Set camera zoom. E.g. ZOOM=2.5', fn: (v) => { RENDERER.setTargetZoom(parseFloat(v)); return `CAM: ZOOM=${v}`; } },
        'SPEED': { desc: 'Set sim speed multiplier. E.g. SPEED=4', fn: (v) => { APP.setSimSpeed(parseFloat(v.replace('x', ''))); UI.syncSlidersToState(); return `SYS: SPEED=×${v}`; } },
        'WIND': { desc: 'Toggle wind. WIND=ON or WIND=OFF', fn: (v) => { const en = v?.toUpperCase() === 'ON'; PHYSICS.setWindEnabled(en); UI.syncSlidersToState(); return `ENV: WIND=${en ? 'ENABLED' : 'DISABLED'}`; } },
        'WIND_STR': { desc: 'Set wind strength m/s. E.g. WIND_STR=5', fn: (v) => { PHYSICS.setWindStrength(parseFloat(v)); return `ENV: WIND_STRENGTH=${v}m/s`; } },
        'GRAVITY': { desc: 'Set gravity m/s². E.g. GRAVITY=3.7 (Mars)', fn: (v) => { PHYSICS.setGravity(parseFloat(v)); return `ENV: GRAVITY=${v}m/s²`; } },
        'MODE': { desc: 'Switch mode. MODE=AUTO or MODE=MANUAL', fn: (v) => { const m = v?.toLowerCase(); PHYSICS.setMode(m); UI.syncSlidersToState(); return `SYS: MODE=${m.toUpperCase()}`; } },
        'TARGET': { desc: 'Set target pitch angle (deg). E.g. TARGET=5', fn: (v) => { PHYSICS.setTargetAngle(parseFloat(v) * Math.PI / 180); return `PID: TARGET=${v}°`; } },
        'HOVER': { desc: 'Set hover altitude target (m). E.g. HOVER=500', fn: (v) => { APP.setHoverTarget(parseFloat(v.replace('m', ''))); return `MISSION: HOVER_TARGET=${v}`; } },
        'GIMBAL_LIM': { desc: 'Set gimbal limit (deg). E.g. GIMBAL_LIM=15', fn: (v) => { PHYSICS.setConfig({ gimbalLimit: parseFloat(v) }); return `CFG: GIMBAL_LIM=±${v}°`; } },
        'STATUS': {
            desc: 'Print current telemetry snapshot', fn: () => {
                const s = PHYSICS.getState();
                return `TEL: ALT=${s.altitude.toFixed(1)}m SPD=${s.speed.toFixed(1)}m/s PITCH=${(s.angle * 180 / Math.PI).toFixed(2)}° FUEL=${s.fuelMass.toFixed(2)}kg`;
            }
        },
        'HELP': { desc: 'Show command reference', fn: () => { UI.showCmdRef(); return 'SYS: DISPLAYING COMMAND REFERENCE'; } },
    };

    function parseCommand(raw) {
        const trimmed = raw.trim().toUpperCase();
        if (!trimmed) return null;

        // CMD=VALUE format
        const eqIdx = trimmed.indexOf('=');
        let name, value;
        if (eqIdx !== -1) {
            name = trimmed.substring(0, eqIdx);
            value = trimmed.substring(eqIdx + 1);
        } else {
            name = trimmed;
            value = null;
        }

        const def = COMMANDS[name];
        if (def) {
            try {
                return def.fn(value);
            } catch (e) {
                return `ERR: COMMAND FAILED — ${e.message}`;
            }
        }

        // Fallback: try "throttle 80" style
        const parts = raw.trim().split(/\s+/);
        const cmd2 = parts[0]?.toUpperCase();
        const val2 = parts[1];
        const def2 = COMMANDS[cmd2];
        if (def2) {
            try { return def2.fn(val2); }
            catch (e) { return `ERR: ${e.message}`; }
        }

        return `ERR: UNKNOWN_CMD "${name}"`;
    }

    function init(inputEl, canvas, log) {
        cmdInput = inputEl;
        simCanvas = canvas;
        logCallback = log;

        // Enter = submit command
        cmdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const raw = cmdInput.value;
                cmdInput.value = '';
                const result = parseCommand(raw);
                log(`> ${raw}`, 'sys');
                if (result) log(result, result.startsWith('ERR') ? 'error' : result.startsWith('SYS') ? 'sys' : 'info');
                e.preventDefault();
            }
        });

        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (document.activeElement === cmdInput) return;
            keyState[e.key] = true;

            if (e.key === ' ') { APP.togglePause(); e.preventDefault(); }
            if (e.key === '+' || e.key === '=') RENDERER.setTargetZoom(RENDERER.getZoom() * 1.3);
            if (e.key === '-') RENDERER.setTargetZoom(RENDERER.getZoom() / 1.3);
            if (e.key === 'r' || e.key === 'R') APP.resetSim();
        });
        window.addEventListener('keyup', (e) => { keyState[e.key] = false; });

        // Mouse drag on canvas during pause
        simCanvas.addEventListener('mousemove', (e) => {
            if (!APP.isPaused()) return;
            const rect = simCanvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const rocketScreen = RENDERER.worldToScreen(PHYSICS.getState().x, PHYSICS.getState().y);
            const dx = sx - rocketScreen.sx;
            const dy = sy - rocketScreen.sy;
            mouseAngle = Math.atan2(dx, -dy); // angle pointing toward mouse
            if (isDragging) {
                PHYSICS.setAngle(mouseAngle);
            }
        });
        simCanvas.addEventListener('mousedown', (e) => {
            if (!APP.isPaused()) return;
            isDragging = true;
        });
        simCanvas.addEventListener('mouseup', () => { isDragging = false; });
        simCanvas.addEventListener('mouseleave', () => { isDragging = false; mouseAngle = null; });

        // Mouse wheel zoom
        simCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.15 : 0.85;
            RENDERER.setTargetZoom(RENDERER.getZoom() * factor);
        }, { passive: false });
    }

    function processKeys() {
        if (document.activeElement === cmdInput) return;
        for (const [key, fn] of Object.entries(KEY_ACTIONS)) {
            if (keyState[key]) fn();
        }
    }

    function getMouseAngle() { return mouseAngle; }

    function getCommandDefs() { return COMMANDS; }

    return { init, processKeys, parseCommand, getMouseAngle, getCommandDefs };
})();

// ── UI helpers (sync sliders ↔ state) ──────────────────────
const UI = (() => {
    let graphLabel = 'pitch';

    function syncSlidersToState() {
        const s = PHYSICS.getState();
        const cfg = PHYSICS.getConfig();
        const pid = PHYSICS.getPID();
        const speed = APP ? APP.getSimSpeed() : 1;

        syncSlider('sl-gimbal-x', s.gimbalX, `${s.gimbalX.toFixed(1)}°`);
        syncSlider('sl-throttle', s.throttle * 100, `${(s.throttle * 100).toFixed(0)}%`);
        syncSlider('sl-kp', pid.kp, pid.kp.toFixed(2));
        syncSlider('sl-ki', pid.ki, pid.ki.toFixed(3));
        syncSlider('sl-kd', pid.kd, pid.kd.toFixed(2));
        syncSlider('sl-speed', speed, `×${speed.toFixed(1)}`);
        updateWindBtn(cfg.windEnabled);
        updateModeBtn(s.mode);
    }

    function syncSlider(id, val, label) {
        const el = document.getElementById(id);
        if (el) el.value = val;
        const lbl = document.getElementById(id + '-val');
        if (lbl) lbl.textContent = label || val;
    }

    function updateWindBtn(enabled) {
        const btn = document.getElementById('btn-wind');
        if (!btn) return;
        btn.textContent = enabled ? 'WIND: ON' : 'WIND: OFF';
        btn.classList.toggle('active', enabled);
    }

    function updateModeBtn(mode) {
        document.getElementById('btn-mode-manual')?.classList.toggle('active', mode === 'manual');
        document.getElementById('btn-mode-auto')?.classList.toggle('active', mode === 'auto');
    }

    function showCmdRef() {
        document.getElementById('cmd-ref-overlay')?.classList.add('show');
    }

    function hideCmdRef() {
        document.getElementById('cmd-ref-overlay')?.classList.remove('show');
    }

    function setGraphLabel(lbl) { graphLabel = lbl; }
    function getGraphLabel() { return graphLabel; }

    function updateWarnings(state) {
        const warn = document.getElementById('warn-attitude');
        const warnFuel = document.getElementById('warn-fuel');
        const warnOverheat = document.getElementById('warn-overheat');
        const warnLanded = document.getElementById('warn-landed');

        if (warn) {
            const bad = Math.abs(state.angle * 180 / Math.PI) > 30;
            warn.classList.toggle('show', bad);
            warn.className = 'hud-warn' + (bad ? ' show danger' : '');
        }
        if (warnFuel) {
            warnFuel.classList.toggle('show', state.fuelMass < 1 && state.launched);
            warnFuel.classList.add('warn');
        }
        if (warnOverheat) {
            warnOverheat.classList.toggle('show', state.overheat);
        }
        if (warnLanded) {
            warnLanded.classList.toggle('show', state.landed);
            if (state.landed) warnLanded.classList.add('good');
        }
    }

    return { syncSlidersToState, showCmdRef, hideCmdRef, setGraphLabel, getGraphLabel, updateWarnings };
})();
