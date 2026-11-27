# Player physics evidence

Reference: Qwasm2 pinned revision c9ab0934, [pmove.c](https://github.com/GMH-Code/Qwasm2/blob/c9ab0934/src/common/pmove.c), [client.c](https://github.com/GMH-Code/Qwasm2/blob/c9ab0934/src/game/player/client.c). Values below are reference-engine values, not Kingpin measurements.

| Parameter | Reference | Kingpin |
| --- | ---: | --- |
| Horizontal hull half-width | 16 | 16, from the entity definitions |
| Hull bottom | -24 | -24, from the entity definitions |
| Standing hull top | 32 | 48, from the entity definitions (applied) |
| Crouched hull top | 4 | Unverified |
| Standing eye offset | 22 | Unverified; 40 used provisionally |
| Crouched eye offset | -2 | Unverified |
| Maximum ground speed | 300 | Unverified |
| Maximum crouch speed | 100 | Unverified |
| Stop speed | 100 | Unverified |
| Ground acceleration | 10 | Unverified |
| Ground friction | 6 | Unverified |
| Minimum jump impulse | 270 | Unverified |
| Step height | 18 | Unverified |

## Standing size (patch 006)

Observed 2026-11-27. `kprad/kingpin.def` in the installation gives `info_player_start` the box (-16 -16 -24) to
(16 16 48), as it does the human characters. In their first frame the thug and punk head models reach about 50 units
above the origin, which is consistent. Neither is a measurement of the running game.

The eye offset of 40 is a guess chosen to sit inside the head models' range; replace it once measured. Crouched
values are unchanged from the reference, so crouching is probably too low.

## Local comparison protocol

Use the same map and start location in the legally acquired original and the experimental engine. Record game version, settings, map, coordinates and elapsed simulation time where available. Use a flat unobstructed segment for speed and acceleration; measure standing and crouched clearance at known geometry; record jump apex and duration, step clearance, and stopping distance. Repeat each run three times. Separate observed values from inferred constants. Keep screenshots and raw original-game outputs in gitignored gamedata/reports. Do not copy SDK code.

Only change shared movement constants after evidence is available. Apply hull and view changes consistently to spawn, movement, prediction and spectator/death paths where relevant. Add synthetic regression fixtures and verify client/server prediction agreement. A walkthrough is not proof of physics parity.
