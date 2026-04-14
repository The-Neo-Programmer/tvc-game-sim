// ============================================================
// TVC SIM v1 — Physics Engine
// ============================================================

const PHYSICS = (() => {
  // --- Constants ---
  const G0 = 9.81;       // standard gravity m/s²
  const RHO_SEA = 1.225; // air density kg/m³ at sea level
  const CD = 0.3;        // drag coefficient
  const AREA = 0.05;     // rocket cross-section m²
  const ISP = 250;       // specific impulse (seconds)

  // ---- State ----
  let state = {};
  let config = {};
  let pid = {};
  let history = [];
  const MAX_HISTORY = 2000;

  function defaultConfig() {
    return {
      mass: 30,          // kg (wet)
      fuelMass: 15,      // kg
      momentArm: 0.5,    // m (nozzle to CoM)
      maxThrust: 800,    // N
      gimbalLimit: 20,   // degrees
      gravity: 9.81,     // m/s²
      windEnabled: false,
      windStrength: 3,   // m/s
      isp: ISP,
      burnTime: 30,      // seconds (max)
    };
  }

  function defaultState(cfg) {
    const r = cfg || config;
    return {
      // Position (m) — y is up
      x: 0,
      y: 0,
      // Velocity (m/s)
      vx: 0,
      vy: 0,
      // Acceleration (m/s²)
      ax: 0,
      ay: 0,
      // Rotation (radians, 0 = pointing up)
      angle: 0,
      angularVel: 0,
      angularAccel: 0,
      // Thrust & fuel
      throttle: 0,       // 0–1
      mass: r.mass,
      fuelMass: r.fuelMass,
      // Gimbal (degrees, converted to rad internally)
      gimbalX: 0,
      gimbalY: 0,
      // Time
      missionTime: 0,
      // Mode: 'manual' | 'auto'
      mode: 'manual',
      // PID target
      targetAngle: 0,    // radians
      // Misc
      thrust: 0,
      speed: 0,
      altitude: 0,
      launched: false,
      landed: false,
      overheat: false,
      fuel: r.fuelMass,
      windVx: 0,
      windVy: 0,
    };
  }

  function defaultPID() {
    return {
      kp: 2.0,
      ki: 0.05,
      kd: 0.8,
      integral: 0,
      prevError: 0,
      output: 0,
    };
  }

  function init(cfg) {
    config = Object.assign(defaultConfig(), cfg || {});
    state = defaultState(config);
    pid = defaultPID();
    history = [];
  }

  // Moment of inertia approximation (thin rod)
  function momentOfInertia() {
    const L = config.momentArm * 4; // rocket length ~4x moment arm
    return (state.mass * L * L) / 12;
  }

  // Air density drops with altitude
  function airDensity(altitude) {
    // Simplified barometric formula
    return RHO_SEA * Math.exp(-altitude / 8500);
  }

  // ---- PID Controller ----
  function computePID(dt) {
    const error = state.targetAngle - state.angle;
    pid.integral += error * dt;
    // Anti-windup
    const maxIntegral = 5;
    pid.integral = Math.max(-maxIntegral, Math.min(maxIntegral, pid.integral));

    const derivative = (error - pid.prevError) / (dt > 0 ? dt : 0.016);
    pid.prevError = error;
    pid.output = pid.kp * error + pid.ki * pid.integral + pid.kd * derivative;

    // Clamp to gimbal limit
    const limitRad = config.gimbalLimit * Math.PI / 180;
    pid.output = Math.max(-limitRad, Math.min(limitRad, pid.output));
    return pid.output;
  }

  // ---- Wind Effect ----
  function updateWind(dt) {
    if (!config.windEnabled) {
      state.windVx = 0;
      state.windVy = 0;
      return;
    }
    // Slowly drifting wind with gusts
    const gustChance = Math.random();
    if (gustChance < 0.005) {
      state.windVx += (Math.random() - 0.5) * config.windStrength * 2;
    }
    // Gentle drift roll-off
    state.windVx *= 0.99;
    state.windVy *= 0.99;
    // Base wind
    const baseWind = config.windStrength * Math.sin(state.missionTime * 0.1);
    state.windVx = state.windVx * 0.9 + baseWind * 0.1;
  }

  // ---- Main Physics Step ----
  function update(dt) {
    if (state.landed || !state.launched) return;

    state.missionTime += dt;

    // Auto mode: PID drives gimbal
    if (state.mode === 'auto') {
      const cmd = computePID(dt);
      state.gimbalX = cmd * 180 / Math.PI;
    }

    // Clamp gimbal to limits
    const gl = config.gimbalLimit;
    state.gimbalX = Math.max(-gl, Math.min(gl, state.gimbalX));
    state.gimbalY = Math.max(-gl, Math.min(gl, state.gimbalY));

    // Effective thrust
    const hasFuel = state.fuelMass > 0;
    const thrustN = hasFuel ? state.throttle * config.maxThrust : 0;
    state.thrust = thrustN;

    // Rocket orientation angle + gimbal deflection
    const totalAngle = state.angle + (state.gimbalX * Math.PI / 180);

    // Thrust components in world frame
    //  rocket points "up" at angle=0; positive angle = tilted right
    const thrustFx = thrustN * Math.sin(totalAngle);
    const thrustFy = thrustN * Math.cos(totalAngle);

    // Torque from gimbal offset
    const gimbalRad = state.gimbalX * Math.PI / 180;
    const torque = thrustN * Math.sin(gimbalRad) * config.momentArm;
    const I = momentOfInertia();
    state.angularAccel = torque / (I > 0 ? I : 1);

    // Drag forces
    const rho = airDensity(state.y);
    const speed2 = state.vx * state.vx + state.vy * state.vy;
    const speed = Math.sqrt(speed2);
    const dragMag = 0.5 * rho * speed2 * CD * AREA;
    const dragFx = speed > 0 ? -dragMag * (state.vx / speed) : 0;
    const dragFy = speed > 0 ? -dragMag * (state.vy / speed) : 0;

    // Wind
    updateWind(dt);
    const windFx = 0.5 * rho * config.windStrength * state.windVx * AREA * CD;
    const windFy = 0;

    // Net force
    const gravFy = -(state.mass * config.gravity);
    const netFx = thrustFx + dragFx + windFx;
    const netFy = thrustFy + dragFy + gravFy + windFy;

    // Euler-Cromer integration
    state.ax = netFx / state.mass;
    state.ay = netFy / state.mass;

    state.vx += state.ax * dt;
    state.vy += state.ay * dt;

    state.x += state.vx * dt + 0.5 * state.ax * dt * dt;
    state.y += state.vy * dt + 0.5 * state.ay * dt * dt;

    state.angularVel += state.angularAccel * dt;
    // Rotational damping (aerodynamic stability)
    state.angularVel *= 0.98;
    state.angle += state.angularVel * dt;

    // Mass depletion: dm/dt = thrust / (Isp * g0)
    if (hasFuel && thrustN > 0) {
      const massFlow = thrustN / (config.isp * G0);
      const fuelUsed = massFlow * dt;
      state.fuelMass = Math.max(0, state.fuelMass - fuelUsed);
      state.mass = Math.max(config.mass - config.fuelMass, state.mass - fuelUsed);
    }

    // Derived values
    state.altitude = Math.max(0, state.y);
    state.speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);

    // Ground check
    if (state.y <= 0 && state.missionTime > 0.5) {
      state.y = 0;
      state.vy = 0;
      state.vx *= 0.3;
      state.angularVel *= 0.3;
      if (Math.abs(state.speed) < 0.5 && Math.abs(state.angle) < 0.2) {
        state.landed = true;
      }
    }

    // Overheat (gimbal near max sustained)
    state.overheat = Math.abs(state.gimbalX) > gl * 0.9;

    // Save telemetry
    if (state.launched) {
      history.push({ x: state.x, y: state.y, angle: state.angle, t: state.missionTime });
      if (history.length > MAX_HISTORY) history.shift();
    }
  }

  // ---- Trajectory Predictor ----
  // Forward-simulates from current state (read-only) for 'steps' at dt_pred
  function predictTrajectory(steps, dt_pred) {
    dt_pred = dt_pred || 0.05;
    const pts = [];

    // Snapshot state
    let px = state.x, py = state.y;
    let pvx = state.vx, pvy = state.vy;
    let pAngle = state.angle;
    let pAngVel = state.angularVel;
    let pMass = state.mass;
    let pFuel = state.fuelMass;
    const throttle = state.throttle;
    const gimbalX = state.gimbalX;

    for (let i = 0; i < steps; i++) {
      const hasFuel = pFuel > 0;
      const thrustN = hasFuel ? throttle * config.maxThrust : 0;
      const totalAngle = pAngle + (gimbalX * Math.PI / 180);
      const thrustFx = thrustN * Math.sin(totalAngle);
      const thrustFy = thrustN * Math.cos(totalAngle);

      const rho = airDensity(py);
      const speed2 = pvx * pvx + pvy * pvy;
      const speed = Math.sqrt(speed2);
      const dragMag = 0.5 * rho * speed2 * CD * AREA;
      const dragFx = speed > 0 ? -dragMag * (pvx / speed) : 0;
      const dragFy = speed > 0 ? -dragMag * (pvy / speed) : 0;

      const netFx = thrustFx + dragFx;
      const netFy = thrustFy + dragFy - pMass * config.gravity;

      const ax = netFx / pMass;
      const ay = netFy / pMass;

      pvx += ax * dt_pred;
      pvy += ay * dt_pred;
      px += pvx * dt_pred;
      py += pvy * dt_pred;

      if (pFuel > 0 && thrustN > 0) {
        const mf = thrustN / (config.isp * G0) * dt_pred;
        pFuel = Math.max(0, pFuel - mf);
        pMass = Math.max(pMass - config.fuelMass, pMass - mf);
      }

      pts.push({ x: px, y: py });
      if (py < 0) break;
    }
    return pts;
  }

  // ---- Public API ----
  return {
    init,
    update,
    predictTrajectory,
    getState: () => state,
    getConfig: () => config,
    getPID: () => pid,
    getHistory: () => history,
    setThrottle: (v) => { state.throttle = Math.max(0, Math.min(1, v)); },
    setGimbalX: (v) => { state.gimbalX = Math.max(-config.gimbalLimit, Math.min(config.gimbalLimit, v)); },
    setGimbalY: (v) => { state.gimbalY = Math.max(-config.gimbalLimit, Math.min(config.gimbalLimit, v)); },
    setMode: (m) => { state.mode = m; if (m === 'auto') pid.integral = 0; },
    setTargetAngle: (rad) => { state.targetAngle = rad; },
    setPID: (kp, ki, kd) => { pid.kp = kp; pid.ki = ki; pid.kd = kd; },
    setAngle: (rad) => { state.angle = rad; state.angularVel = 0; },
    launch: () => { state.launched = true; state.throttle = 0.8; },
    reset: (cfg) => { init(cfg || config); },
    setWindEnabled: (en) => { config.windEnabled = en; },
    setWindStrength: (s) => { config.windStrength = s; },
    setGravity: (g) => { config.gravity = g; },
    setConfig: (cfg) => {
      Object.assign(config, cfg);
      // If not launched yet, re-init state masses
      if (!state.launched) {
        state.mass = config.mass;
        state.fuelMass = config.fuelMass;
        state.fuel = config.fuelMass;
      }
    },
  };
})();
