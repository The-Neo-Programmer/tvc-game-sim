# TVC SIM v1 — Command Reference

## Terminal Commands

All commands are entered in the command bar at the bottom of the screen (press Enter to execute).
You can also use the `CMD=VALUE` or `CMD VALUE` format.

---

### 🚀 Simulation Control

| Command | Description |
|---|---|
| `LAUNCH` | Ignite engine and begin flight |
| `PAUSE_SIM` | Freeze physics (also: Spacebar) |
| `RESUME_SIM` | Resume simulation after pause |
| `RESET_SIM` | Reset to pre-flight state |
| `STATUS` | Print current telemetry snapshot |

---

### 🎮 Flight Controls (Keyboard)

| Key | Action |
|---|---|
| `Space` | Pause / Resume |
| `Arrow Up` / `W` | Increase throttle |
| `Arrow Down` / `S` | Decrease throttle |
| `Arrow Left` / `A` | Gimbal left |
| `Arrow Right` / `D` | Gimbal right |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `R` | Reset simulation |
| Mouse Wheel | Zoom in/out |
| Mouse Drag (paused) | Rotate rocket orientation |

---

### ⚙️ Control Surface Commands

| Command | Example | Description |
|---|---|---|
| `GIMBAL_X` | `GIMBAL_X=5` | Set gimbal X deflection (±degrees) |
| `GIMBAL_Y` | `GIMBAL_Y=3` | Set gimbal Y deflection (±degrees) |
| `THROTTLE` | `THROTTLE=80` | Set throttle 0–100% |
| `MODE` | `MODE=AUTO` | Switch between MANUAL / AUTO (PID) |
| `TARGET` | `TARGET=5` | Set target pitch angle (degrees) for PID |
| `GIMBAL_LIM` | `GIMBAL_LIM=15` | Max gimbal deflection (degrees) |

---

### 🔧 PID Tuning

| Command | Example | Description |
|---|---|---|
| `KP` | `KP=2.0` | Proportional gain (response speed) |
| `KI` | `KI=0.05` | Integral gain (steady-state correction) |
| `KD` | `KD=0.8` | Derivative gain (damping, reduces overshoot) |

**Tips:**
- High `KP` → faster corrections but potential oscillation
- Increase `KD` to reduce oscillation
- Use `KI` to fix persistent steady-state angle error

---

### 🌍 Environment

| Command | Example | Description |
|---|---|---|
| `WIND` | `WIND=ON` / `WIND=OFF` | Toggle wind disturbances |
| `WIND_STR` | `WIND_STR=5` | Wind strength in m/s |
| `GRAVITY` | `GRAVITY=3.7` | Gravity in m/s² (e.g., 3.7 = Mars) |

---

### 📷 Camera & Playback

| Command | Example | Description |
|---|---|---|
| `ZOOM` | `ZOOM=2.5` | Set camera zoom level (0.05–12) |
| `SPEED` | `SPEED=4` | Simulation speed multiplier (0.1–10×) |

---

### 🎯 Mission Commands

| Command | Example | Description |
|---|---|---|
| `HOVER` | `HOVER=500` | Set hover altitude target in metres |
| `HELP` | `HELP` | Show command reference overlay |

---

## Pre-flight Configuration Panel

Click **[PRE-FLIGHT CONFIG]** to set:
- **Rocket Mass** (kg) — total wet mass
- **Fuel Mass** (kg) — propellant mass
- **Moment Arm** (m) — nozzle to centre-of-mass distance
- **Max Thrust** (N) — engine rated thrust
- **Gimbal Limit** (°) — maximum deflection
- **Gravity** (m/s²) — planetary gravity

---

## HUD Warning Codes

| Warning | Trigger |
|---|---|
| `ATTITUDE WARN` | Pitch angle exceeds ±30° |
| `OVERHEAT` | Gimbal near maximum deflection |
| `FUEL LOW` | Fuel < 1 kg remaining |
| `LANDED` | Successful touchdown |

---

## Physics Model

- **Thrust decomposition**: `Fx = T·sin(θ_rocket + θ_gimbal)`, `Fy = T·cos(θ_rocket + θ_gimbal)`
- **Torque**: `τ = T·sin(θ_gimbal) × moment_arm`
- **Drag**: `F_drag = ½ρv²·Cd·A` (altitude-dependent density)
- **Mass flow**: `ṁ = T / (Isp × g₀)`
- **Integration**: Euler-Cromer (semi-implicit) for stability
