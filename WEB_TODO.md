# Meshtastic Web Client — Roadmap

Standalone roadmap for `web/packages/web`. The main `TODO.md` captures bugs and feature-request parity with iOS/Android; this file is the forward plan for new UX work.

---

## Overarching theme: "Simple Mode by default, Advanced on demand"

The web client currently surfaces every protobuf field with no opinion about which ones a typical user should ever touch. The goal is to make the default experience match what 90% of users actually do (pick a region, pick a preset, send messages) and tuck the rest behind an explicit Advanced toggle.

A single user-level preference — `simpleMode: boolean` (default **true**) — controls every conditional element described below. Store it in `appStore` (or a new `uiPrefsStore`) and persist via `useLocalStorage`.

```ts
// core/stores/appStore/types.ts
interface AppState {
  // ...
  simpleMode: boolean;
  setSimpleMode: (value: boolean) => void;
}
```

A single `useSimpleMode()` hook (`return useAppStore(s => s.simpleMode)`) is consumed everywhere — there is no per-screen state.

---

## 1. Simple Mode Toggle

### Where it lives
At the very top of the Settings page header, above the tab list. Persistent across navigation; not hidden in a sub-menu.

```
┌─────────────────────────────────────────────┐
│  Settings                                   │
│  ┌─ Show advanced settings  [ ○ ]  ─┐       │
│  └────────────────────────────────────┘       │
│                                             │
│  [ Radio ] [ Device ] [ Modules ]           │
└─────────────────────────────────────────────┘
```

### Behavior
- **Off (default)** — simplified views everywhere. Advanced fields and entire advanced tabs/sections are hidden.
- **On** — every field is visible, same as current behavior.
- Toggle state has no effect on what is *saved* to the device; it only controls visibility. A user who turns Advanced on, edits a field, then turns it off, will still have the changed value saved (and a small "Advanced settings modified" badge should appear on the section header so it's discoverable).

### Implementation note
Use a `<FieldGroup hidden={isSimple}>` wrapper or, for individual fields, a `visibility: "advanced"` property on the field config consumed by `DynamicForm`. This keeps logic out of every component.

---

## 2. Hide Primary Channel Settings

### Goal
The user should never edit channel index 0 manually. It is always Primary, always exists, and its name is always "LongFast" (or whatever the user-chosen modem preset's display name is).

### Changes
- `Channels.tsx` — remove the tab for channel index 0 in simple mode. The Channels page shows only secondary channels (1–7), with an "Add Channel" button.
- `Messages.tsx` sidebar — the primary channel is still listed for messaging, but tapping its row doesn't link to a settings page (only opens its chat).
- `getChannelName()` — when `channel.index === 0` and the stored name is empty, resolve to the current modem preset's display name (e.g. `LongFast`, `MediumFast`) instead of the "Broadcast" fallback. This matches the firmware's internal behavior and fixes a related iOS bug too.

### What replaces the Primary tab
A read-only summary card in the LoRa settings page:

```
Primary Channel
  Name: LongFast   (auto, from modem preset)
  Encryption: Default AQ== key
  Position precision: 32 (full)

[ Show advanced ]   ← opens the full channel editor
```

---

## 3. LoRa Preset Picker (simplified)

### Current state (Settings → Radio → LoRa)
Exposes: region, hopLimit, channelNum, ignoreMqtt, configOkToMqtt, usePreset, modemPreset, bandwidth, spreadFactor, codingRate, txEnabled, txPower, overrideDutyCycle, frequencyOffset, sx126xRxBoostedGain, overrideFrequency.

That's 16 fields. A new user has no business touching 12 of them.

### Simple mode shows only:
| Field | Why it stays |
|-------|--------------|
| **Region** | Required for legal operation |
| **Modem Preset** | The single most important choice; controls coverage vs. speed |
| **Max Hops** (`hopLimit`) | Practical impact, easy to understand (default 3 in simple mode instead of 7) |
| **Transmit Power** | Some users want to lower it; intuitive |
| **MQTT** (single toggle that controls both `okToMqtt` and `ignoreMqtt`) | Privacy-relevant |

`usePreset` is forced to `true` and hidden. Bandwidth/spread factor/coding rate disappear with it.

### Default values when a new user enables a modem preset:
- `usePreset = true`
- `channelNum = 0` (auto)
- `txEnabled = true`
- `overrideDutyCycle = false`
- `frequencyOffset = 0`
- `overrideFrequency = 0`
- `sx126xRxBoostedGain = true` if the hardware supports it

### Advanced mode reveals (in addition to the above):
- Channel slot override (`channelNum`)
- Custom waveform (toggle off `usePreset`, edit `bandwidth`/`spreadFactor`/`codingRate`)
- Frequency offset
- Override frequency
- Override duty cycle
- Boosted RX gain
- Separate `ignoreMqtt` and `okToMqtt` toggles

---

## 4. Right-click Context Menu on Nodes

### Where
- Nodes table (`pages/Nodes/index.tsx`)
- Messages sidebar contact list (`pages/Messages.tsx` direct-messages section)
- Future: node markers on the Map page

### Actions (parity with iOS/Android node actions)

Use `@radix-ui/react-dropdown-menu` (already a dependency) wrapped in a `<ContextMenu>` component to handle the `onContextMenu` event (and long-press on touch devices).

| Action | Implementation | Simple mode? |
|--------|---------------|--------------|
| **Send Message** | Navigate to `/messages/direct/{nodeNum}` | Yes |
| **User Info** (ping) | `connection.sendPacket(...)` with `NODEINFO_APP` portnum and `wantResponse=true` to update signal | Yes |
| **Trace Route** | `connection.traceRoute(nodeNum)` | Yes |
| **Request Position** | `connection.requestPosition(nodeNum)` | Yes |
| **Request Telemetry** | Request `LOCAL_STATS` telemetry — refreshes signal info | Yes |
| **Favorite / Unfavorite** | Update local store flag (no over-the-air action) | Yes |
| **Mute notifications** | Local flag | Yes |
| **Copy Node ID** | Clipboard, both hex `!a1b2c3d4` and decimal forms | Yes |
| **Show on Map** | Navigate to `/map?focus={nodeNum}` | Yes |
| **Ignore Node** | Local + sends admin to device | Advanced only |
| **Remove from NodeDB** | `connection.removeNodeByNum(nodeNum)` | Advanced only |
| **Reboot Remote** | PKI admin packet, only if metadata + key known | Advanced only |
| **Shutdown Remote** | PKI admin packet | Advanced only |
| **Open Remote Admin** | Navigate to remote node's settings | Advanced only |

### Existing `MeshDevice` methods to reuse
- `traceRoute(destination)` — already exists
- `requestPosition(destination)` — already exists
- `removeNodeByNum(nodeNum)` — already exists
- `reboot(time)` / `shutdown(time)` — already exist (currently called on local node)
- `sendText(...)` for messaging

### What needs to be added
- A `sendNodeInfo(destination, wantResponse: true)` helper in `@meshtastic/core` (the ping action)
- A `requestTelemetry(destination, type)` helper
- A new `pendingActions` slice in `deviceStore` so the UI can show "Trace route in progress…" until the response arrives

### UX note
- Long-press on a node row in mobile/touch contexts should open the same menu as right-click — Radix's DropdownMenu handles this if you trigger it from a custom `onTouchStart` timer.
- **Done:** Right-clicking a node currently opens the node detail modal (the same behavior as left-click). This must be restricted to left-click only so the context menu can operate without interference.

---

## 5. Simplified Settings Page

### Current structure
```
Settings
├── Radio
│   ├── LoRa
│   ├── Channels (8 tabs, one per channel slot)
│   └── Security
├── Device
│   ├── Device (general)
│   ├── Display
│   ├── User
│   ├── Position
│   ├── Power
│   ├── Network
│   └── Bluetooth
└── Modules
    └── (12 module tabs)
```

### Simple-mode structure (proposed)
```
Settings   [Show advanced ○]

├── User      ← name, short name, MQTT opt-in
├── Radio     ← region, preset, hops, TX power (the 5 simple-mode fields)
├── Channels  ← secondary channels only, primary shown as read-only card
├── Position  ← GPS mode + smart position toggle + fixed-position entry
└── Messages  ← unread/notification preferences
```

### What advanced mode reveals on top of the simplified structure
- **Radio**: full LoRa form + Security tab (PKI keys, admin sessions)
- **Device** tab group reappears in full (Display, Power, Network, Bluetooth, full Device)
- **Modules** tab group reappears in full (MQTT, External Notification, Canned Messages, Detection Sensor, Range Test, Store & Forward, Serial, Audio, Paxcounter, Neighbor Info, Ambient Lighting, Telemetry)

### What goes behind the Advanced toggle (recommended cutoffs)

#### Always-Advanced (most users will never touch these)
| Section | Reasoning |
|---------|-----------|
| **Security** (PKI keys, admin sessions, key backup) | Cryptography — surfacing keys to a casual user is a foot-gun |
| **Bluetooth** (PIN mode, fixed PIN, bonding) | Reasonable defaults exist |
| **Network** (WiFi, Ethernet, NTP, RsyslogServer, UDP broadcast) | Most users only use BLE |
| **Power** (LS sleep, ADC multiplier, battery thresholds, super-deep-sleep) | Misconfiguration bricks usability |
| **Display** (screen layout, units, oled, compass tooltip, wake-on-tap) | Each board has sane defaults |
| **Device** advanced fields (role, rebroadcast mode, GPIO pins, NodeInfo broadcast secs, button GPIO, buzzer GPIO, double-tap, triple-click, LED heartbeat) | Hardware-specific |
| **Module Configs** — all except a "Position" simple page | Modules are by definition opt-in technical features |
| **LoRa**: `channelNum`, `frequencyOffset`, `overrideFrequency`, `overrideDutyCycle`, `sx126xRxBoostedGain`, `txEnabled`, `usePreset` toggle, manual bandwidth/spread factor/coding rate | Already detailed in §3 |
| **Channels**: Channel slot 0 settings, all 8 channel slots editor | Already detailed in §2 |
| **Position**: position flags bitmask, GPS GPIO pins, advanced smart-position internals, broadcast precision per channel | The simple Position page only exposes: GPS mode (Enabled/Disabled/Not Present), Fixed Position toggle with lat/lon/alt entry, Smart Position toggle, Position Broadcast Interval (free-text number) |

#### Simple-mode-visible (the must-haves)
| Section | Fields exposed |
|---------|---------------|
| **User** | Long name, short name, "Licensed operator" toggle |
| **Radio** | Region, Modem Preset, Max Hops, TX Power, MQTT (single combined toggle) |
| **Channels** | Secondary channel list (add/edit/delete), QR import/export |
| **Position** | GPS mode, Fixed Position, lat/lon/alt entry, Smart Position toggle, Broadcast Interval |
| **Notifications** (new page) | Per-channel mute, per-DM mute, sound preference |

### Discoverability
At the bottom of every simplified page show a subtle footer:

```
[ Showing simplified settings — Enable Advanced for more options ]
```

If a user previously edited Advanced fields with values that differ from defaults, show a badge on the affected section header:

```
Radio  ⚙ (3 advanced settings modified)
```

So no one's edits are "lost" when toggling Simple mode back on.

---

## 6. Implementation Order

1. **Add `simpleMode` to `appStore` + `useSimpleMode()` hook** — foundational, near-zero risk.
2. **Add Simple Mode toggle in Settings header** — UI placement and persistence, no behavior changes yet.
3. **`DynamicForm` `visibility: "advanced"` field property** — wire `useSimpleMode()` into the form renderer once; every subsequent change is a one-line addition per field.
4. **Simplify LoRa page** — biggest user-visible impact, contained scope.
5. **Hide primary channel tab in `Channels.tsx`** — and resolve empty name to preset display name.
6. **Right-click context menu** — needs new component (`<NodeContextMenu>`) + a few small additions to `@meshtastic/core` (`sendNodeInfo`, `requestTelemetry` helpers).
7. **Restructure Settings sidebar** — fold Device tab group and Module tab group into Advanced-only.
8. **Notifications page** — new, low priority.
9. **Mesh Live Stream** — separate large feature, tracked in main `TODO.md`.

---

## 7. Node List Quality Improvements

### Show *why* we heard from each node

Every received `MeshPacket` carries a `decoded.portnum` that identifies the packet type (NodeInfo, Position, Telemetry, Routing, Traceroute, etc.). The web client currently discards this when calling `processPacket()` and only stores `from`, `snr`, and `time`. As a result, a user looking at the node list has no way to tell whether a node showed up because it broadcast its identity (NodeInfo), reported its location (Position), or sent telemetry.

**Implementation:**
- Extend `processPacket` to accept and store the most recent portnum on each node
- Wire `subscriptions.ts` to extract `pkt.payloadVariant.value.portnum` from `onMeshPacket` events and pass it through
- Add a column or inline icon in the Nodes table showing the latest reason heard (📍 Position, 📡 Telemetry, 👤 NodeInfo, 💬 Message, 🛣️ Traceroute, etc.)
- Optionally also track *all* portnums seen recently per node (rolling histogram) for a richer node detail view

Helps with debugging silent nodes ("we keep hearing NodeInfo but never position — their GPS is probably disabled") and gives the user a feel for what each node is contributing to the mesh.

### Don't show signal strength for relayed packets

Both `processPacket` (web) and the equivalent in iOS unconditionally overwrite `snr` and `rssi` on the originating node when a packet from them arrives. But for multi-hop packets the SNR/RSSI values are measurements of the **last-relay → gateway** link, not the originating node's transmission. This produces misleading data: a node 7 hops away shows the same SNR as its last-hop relay, repeated across every node that relay forwards for.

**Fix:**
- Only update `snr`/`rssi` when the packet arrived with `hopsAway === 0` and `viaMqtt === false` (i.e., we directly heard the originator)
- For relayed packets, leave the originator's `snr`/`rssi` unchanged (or clear them, signaling "no direct signal")
- In the Nodes table, hide or grey out the SNR column for any row whose connection isn't "Direct"; consider an annotation like "no direct signal"

This is the same root issue tracked in main `TODO.md` under "Signal quality wiped by relay retransmissions" for iOS — the web client has the identical code pattern and needs the same fix.

---

## Core design principle

**Simple mode is purely a view preference and never modifies saved config values.** Toggling Simple mode on or off changes only what is displayed; it never writes to the device. The only way Simple-mode defaults are applied is when a user explicitly chooses to **Reset to Simple Defaults** (a button surfaced in Advanced mode), which would set values like `hopLimit = 3`, `usePreset = true`, etc.

This means a user with a custom `hopLimit = 7` who toggles Simple mode will continue to operate at 7 hops — the field is just hidden. If they want the simple default applied, they invoke Reset explicitly.

## Open questions / risks

- **Channel name resolution** — if the user manually renames channel 0 to something other than the preset name, do we restore it? Recommended: no, preserve their explicit choice; only auto-resolve when the stored name is empty.
- **Where does "Reset device" live?** — Currently in advanced Device tab; keep there.
- **Mesh Live Stream — should it be Simple or Advanced?** — Probably Simple, since it's read-only and informative rather than destructive.
- **Touch context menu UX** — long-press is non-obvious; need a small "⋮" affordance on each row for discoverability.

## 8. Messaging UX Improvements

- In Messages, messages should include #hops when available or "direct" with appropriate icons.

## 9. Message Context Menu & Advanced Info

### Commands (Right-click on a message)
- **Reply** — Focuses the message input and sets up a reply context (potentially with a quote or "Replying to...")
- **Copy Message Text** — Copies the body to clipboard
- **Copy Packet ID** — Copies the hex ID (e.g. `!a1b2c3d4`) to clipboard
- **Trace Route** — Initiates a traceroute to the sender
- **Message Details** — Opens a dialog/popover showing all available "Advanced Info"
- **Delete Message** — Removes the message from the local browser store

### Advanced Info (available in Message Details)
- **Packet ID** — Hex representation
- **Signal Quality** — SNR (dB) and RSSI (dBm) for direct packets
- **Hops** — Displays `hopsAway` / `hopLimit` (e.g. "2 hops away (max 3)")
- **Transport** — How it arrived: LoRa, MQTT, or API
- **Priority** — The internal priority used (Background, Default, Reliable, etc.)
- **Flags** — ACK requested, PKI encrypted, etc.

### Implementation Tasks
- [ ] Extend `PacketMetadata` in `@meshtastic/core` to include signal and hop fields
- [ ] Update `MeshDevice.ts` to populate these fields from the raw `MeshPacket`
- [ ] Update `Message` interface and `PacketToMessageDTO` in `@web` to store and map these fields
- [ ] Create `MessageContextMenu` component using Radix
- [ ] Create `MessageDetailsDialog` to display the advanced info
