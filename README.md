# Packing Lab 3D

Browser-local, vendor-neutral educational PLC and intermittent packing machine simulator.

## Run locally

Serve `` over HTTP with any static file server. No build or runtime dependencies are required. Open `index.html` through that server (ES modules need HTTP).

## Controls

1. Load Working Example, then Run and Start. Run controls simulation time; Start is a field input.
2. I/O Wiring: select a field source then a PLC input, or a PLC output then an actuator. Delete a cable by clicking it or using the connection list.
3. PLC Ladder: add series slots, parallel contacts, NO/NC, coils, TON, CTU and rung ordering. Changes pause execution and reset PLC runtime, preserving the physical machine and session data. Start again to resume. Invalid addresses or duplicate instruction outputs block Run and deenergize outputs on Single Scan.
4. Physical parameters are on Machine Simulation. Timer presets live only in PLC Ladder; T0 and T1 shortcut links are provided.
5. Pause and Single Scan advance exactly one 10 ms scan. 0.5×, 1× and 2× affect wall-clock pacing only. Hidden browser tabs automatically pause.
6. E-stop freezes motion through an independent educational interlock. Release E-stop, Safety Reset, then Start. This is not a physical safety circuit design.
7. Trends & Data exports all samples (100 ms), events and complete session JSON with configuration revision history. Save/Load Project stores wiring, ladder, parameters and faults; load always resets runtime and starts paused.

## Architecture

- `plc.js`: sequential ladder interpreter, timers, counters and program validation.
- `model.js`: deterministic physical model, signal wiring definitions, geometry, fault and quality rules.
- `engine.js`: fixed scan orchestration, project validation, safety latch, session sampling and CSV serialization.
- `app.js`: UI rendering and browser controls, wiring canvas, ladder editor and SVG charts.
- `style.css` and `index.html`: responsive industrial workspace.
- `tests/simulation.test.mjs`: behavior and integration tests (`npm test`).

## Model contract

Distance in mm; speed in mm/s. Conveyor 1,100 mm; product length 60 mm; jaw center 600 mm; acceptable center ±25 mm; jaw capture ±100 mm. New products feed at x=30 based on belt travel and configured center-to-center spacing. No inertia, thermal behavior, electrical voltage/current or collision physics. Product jam is an injected mechanical belt stop, not a simulated accumulation queue.

Full-closed dwell must reach 500 ms, center must be in tolerance, product must remain stationary, and sealing must not be interrupted by E-stop. Good/reject is counted when the product fully exits (center >1,130 mm). Throughput includes idle simulated time: completed / simulation seconds ×60. Alarm duration is the union of scans with at least one active model diagnostic. Fault diagnostics are intentionally known to the model and can be wired to I0.6; they are not hidden PLC logic.

A scan reads the wired input image, evaluates rungs in order, applies the final output image, then advances physics. Internal and output bit writes are visible to later rungs in that scan. Contacts read I0.0–I0.7, Q0.0–Q0.7, M0.0–M7.7, T0.DN–T9.DN, C0.DN–C9.DN. Series groups are AND, contacts within a group are OR. TON starts at zero on the rising enable scan and resets when disabled. CTU counts enable rising edges; a configurable reset bit takes precedence. Presets are quantized to 10 ms scan timing. Output and memory addresses have a single writer. Omitted wiring means false inputs and inactive actuators.

The default T0=1,130 ms, T1=700 ms and T2=20 ms run continuous complete cycles. The sealing counter is distinct from completed output count: it counts cycles, including unsuccessful seal attempts.

## Verification

18 Node tests cover sustained good cycles, sensor/motor disconnection, speed, timer travel and dwell, NO/NC/series/parallel semantics, scan order, TON/CTU semantics, all four faults, E-stop latching, mandatory Start after reset even with unconditional user logic, and restart, ladder edits, validation, single scans, project roundtrip and traceable CSV.

Browser QA covers Run/Start/Pause, exact Single Scan increment, wiring disconnect/reconnect, ladder timer editing, digital/live charts, CSV download and project save/load.

State lives in the browser tab; save your project before closing. CSV and session exports are generated from the current session only. No hardware connection or PLC vendor compatibility is claimed.

## Interactive 3D (v2)

Default view is a perspective 3D factory cell with conveyor rollers, motor, photoeye, pneumatic sealing jaw, guards, HMI and control cabinet. Drag to orbit, wheel to zoom, Shift+drag to pan. Presets show overview, operator front, top and sealing close-up. Click equipment to inspect actual status and wired PLC address. Labels, guards and factory visibility are visual controls only. Switch to 2D for the original dimensional diagram.

`view-state.js` is a read-only mm-to-world adapter. `machine-3d.js` renders the same physical state with Three.js 0.180.0; vendor modules and MIT license are bundled in `vendor/`, with no CDN dependency. `canvas-3d-renderer.js` provides perspective CPU rendering when WebGL is unavailable; this compatibility mode simplifies lighting, transparency and surface occlusion. Factory furnishings are illustrative and do not add physics.

3D browser QA verified seven completed good products, camera presets, component inspection, pause and a 10 ms single scan in compatibility mode. The test browser disables WebGL, so GPU rendering was not visually verified there. Three additional automated tests verify actual coordinates, closed-jaw travel, motor disconnection, read-only rendering and restored project state.

## GitHub Pages

Extract this ZIP. Upload ALL contents, including vendor/ and tests/, to the root of your GitHub repository. index.html must be at repository root. In repository Settings → Pages, choose Deploy from a branch, main, /(root), then Save. Keep vendor/ intact; no build step or CDN is required. This ZIP is ready for repository subpath hosting because all assets use relative imports. For local use: python -m http.server 8000, then open http://localhost:8000. Run npm test for automated tests.
