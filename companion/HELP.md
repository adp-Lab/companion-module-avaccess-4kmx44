# AV Access 4KMX44-H2

Companion module for the AV Access 4KMX44-H2 4x4 HDMI matrix, controlled over its Telnet/IP API (port 23 by default).

## Configuration

| Option | Description |
| --- | --- |
| Target IP | The matrix's IP address |
| Target Port | Telnet control port, default 23 |

## Actions

- Switch Input to Output
- Reboot Matrix
- Save / Recall Hardware Scene
- Set Audio Mute · Toggle Audio Mute · Toggle Audio Mute (All Outputs)
- Set HDCP Support · Toggle HDCP Support
- Set Output Downscaler · Toggle Output Downscaler
- Set CEC Display Power
- Set Input EDID

## Feedbacks

All feedbacks turn the button **RED** when active: Routing (input live on output), Scene (stored scene matches live routing), Audio Mute (per-output, and all-outputs), HDCP enabled, Output Downscaler on.

## Presets

Routing (4×4 grid), Scenes (long-press Save 1-3 / Load 1-3), Mute, HDCP, Scaler, CEC power, System (reboot) — drag any preset in and it's pre-wired with the matching action + feedback.

## Variables

- Routing: `out{1-4}_source`, `in{1-4}_outputs`, `routing_summary`, `active_scene`
- Audio/HDCP/Scaler: `out{1-4}_mute`, `in{1-4}_hdcp`, `out{1-4}_scaler`
- EDID: `in{1-4}_edid` (human-readable preset label)
- Device info: `model`, `firmware`, `ip_address`, `ip_mode`

## Known limitations

CEC power has no status feedback (the device doesn't expose a query for it — fire-and-forget only). The matrix only has 3 hardware scene slots.
