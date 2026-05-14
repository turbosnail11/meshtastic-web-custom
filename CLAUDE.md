# Meshtastic Web

Official Meshtastic web interface and supporting JS/TS libraries. Served directly from a node over HTTP or hosted at `client.meshtastic.org`.

## Monorepo Structure

Managed with **pnpm workspaces**. All packages live in `packages/`.

| Package | Name | Purpose |
|---------|------|---------|
| `packages/web` | `meshtastic-web` | React web client (the UI) |
| `packages/core` | `@meshtastic/core` | `MeshDevice` class, event system, packet queue — the JS SDK core |
| `packages/protobufs` | `@meshtastic/protobufs` | Protobuf definitions (git submodule, published to JSR) |
| `packages/transport-http` | `@meshtastic/transport-http` | HTTP transport |
| `packages/transport-web-bluetooth` | `@meshtastic/transport-web-bluetooth` | Web Bluetooth API transport |
| `packages/transport-web-serial` | `@meshtastic/transport-web-serial` | Web Serial API transport |
| `packages/transport-node` | `@meshtastic/transport-node` | TCP transport for Node.js |
| `packages/transport-node-serial` | `@meshtastic/transport-node-serial` | Serial transport for Node.js |
| `packages/transport-deno` | `@meshtastic/transport-deno` | TCP transport for Deno |

## Tech Stack

- **Framework:** React 19 + TypeScript
- **Routing:** TanStack Router (file-based, type-safe)
- **State:** Zustand stores
- **Styling:** Tailwind CSS v4 + Radix UI primitives
- **Map:** MapLibre GL + react-map-gl
- **Forms:** React Hook Form + Zod validation
- **Build:** Vite
- **Testing:** Vitest + React Testing Library
- **Linting/Formatting:** oxlint + oxfmt
- **Package manager:** pnpm (enforced via `only-allow`)

## Key Source Paths (`packages/web/src/`)

| Path | Contents |
|------|---------|
| `App.tsx` | Root component |
| `routes.tsx` | TanStack Router route tree |
| `DeviceWrapper.tsx` | Wraps pages with device context |
| `core/stores/` | Zustand stores: `deviceStore`, `nodeDBStore`, `messageStore`, `appStore`, `sidebarStore` |
| `core/subscriptions.ts` | Wires `MeshDevice` events → store updates (the glue layer) |
| `core/hooks/` | Custom React hooks |
| `core/dto/` | Data transfer objects (packet → UI model transforms) |
| `core/services/` | Feature flag config |
| `pages/Connections/` | Device connection UI (Bluetooth, Serial, HTTP) |
| `pages/Messages.tsx` | Channel and DM messaging |
| `pages/Map/` | MapLibre mesh map |
| `pages/Nodes/` | Node list and detail |
| `pages/Settings/` | Radio config, device config, module config |
| `components/` | Shared UI components (Sidebar, Dialog, Form, Badge, etc.) |

## Core Architecture

### `MeshDevice` (`packages/core/src/meshDevice.ts`)
The central SDK class. Wraps a `Transport` and exposes:
- `events` — `EventSystem` with typed emitters for every packet type (`onNodeInfoPacket`, `onTextMessagePacket`, `onTelemetryPacket`, etc.)
- `queue` — `Queue` for outgoing packets with ACK tracking
- All send methods (`sendText`, `sendPosition`, `setConfig`, `setChannel`, etc.)

### Data flow
```
Transport (BLE/Serial/HTTP)
  → MeshDevice.events (EventSystem)
    → subscribeAll() in subscriptions.ts
      → Zustand stores (deviceStore, nodeDBStore, messageStore)
        → React components
```

### Transports
Each transport implements the `Transport` interface from `packages/core/src/types.ts`. The web client uses:
- **Web Bluetooth** — direct BLE connection to nearby node
- **Web Serial** — USB/serial connection
- **HTTP** — connects to a node's built-in HTTP server (same network)

## Commands

```bash
# Install all dependencies
pnpm install

# Run web client dev server
cd packages/web && pnpm dev

# Run dev server with HTTPS (required for Bluetooth in some browsers)
cd packages/web && pnpm dev:https

# Build all packages
pnpm build:all

# Build web client only
cd packages/web && pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Format check
pnpm format

# Fix lint + format
pnpm check:fix

# Docker
cd packages/web && docker build -t meshtastic-web:latest -f ./infra/Containerfile .
docker run -d -p 8080:8080 meshtastic-web:latest
```

## State Management

Each Zustand store has a clear responsibility:

| Store | Holds |
|-------|-------|
| `deviceStore` | Connected device state, config, channels, metadata, waypoints |
| `nodeDBStore` | All known nodes (NodeInfo, positions, telemetry) |
| `messageStore` | Channel messages and DMs |
| `appStore` | UI state (active device, dialogs, theme) |
| `sidebarStore` | Sidebar open/close state |
| `messageStore` | Received and sent messages |

## Connections

The Connections page (`pages/Connections/`) handles:
- Scanning for and pairing Bluetooth devices
- Selecting a serial port
- Entering an HTTP address for TCP connections

On successful connection a `MeshDevice` is created with the chosen transport and `subscribeAll()` is called to wire events to stores.

## Notes

- The web client is also bundled and served directly from Meshtastic firmware nodes at port 80. The firmware serves the pre-built `dist/` output.
- `packages/protobufs` is a git submodule pointing to the shared Meshtastic protobuf definitions — run `git submodule update --init` if it's empty.
- Feature flags live in `packages/web/src/core/services/featureFlags.ts`.
- i18n is handled via `i18next` with translations loaded from the backend at runtime.
