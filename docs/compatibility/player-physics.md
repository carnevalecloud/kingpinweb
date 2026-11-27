# Player physics evidence

Reference: Qwasm2 pinned revision c9ab0934, [pmove.c](https://github.com/GMH-Code/Qwasm2/blob/c9ab0934/src/common/pmove.c), [client.c](https://github.com/GMH-Code/Qwasm2/blob/c9ab0934/src/game/player/client.c). Values below are reference-engine values, not Kingpin measurements.

| Parameter | Reference | Kingpin |
| --- | ---: | --- |
| Horizontal hull half-width | 16 | Unverified |
| Hull bottom | -24 | Unverified |
| Standing hull top | 32 | Unverified |
| Crouched hull top | 4 | Unverified |
| Standing eye offset | 22 | Unverified |
| Crouched eye offset | -2 | Unverified |
| Maximum ground speed | 300 | Unverified |
| Maximum crouch speed | 100 | Unverified |
| Stop speed | 100 | Unverified |
| Ground acceleration | 10 | Unverified |
| Ground friction | 6 | Unverified |
| Minimum jump impulse | 270 | Unverified |
| Step height | 18 | Unverified |

## Local comparison protocol

Use the same map and start location in the legally acquired original and the experimental engine. Record game version, settings, map, coordinates and elapsed simulation time where available. Use a flat unobstructed segment for speed and acceleration; measure standing and crouched clearance at known geometry; record jump apex and duration, step clearance, and stopping distance. Repeat each run three times. Separate observed values from inferred constants. Keep screenshots and raw original-game outputs in gitignored gamedata/reports. Do not copy SDK code.

Only change shared movement constants after evidence is available. Apply hull and view changes consistently to spawn, movement, prediction and spectator/death paths where relevant. Add synthetic regression fixtures and verify client/server prediction agreement. A walkthrough is not proof of physics parity.
