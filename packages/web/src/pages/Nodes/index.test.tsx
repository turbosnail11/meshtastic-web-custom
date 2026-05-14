import { create } from "@bufbuild/protobuf";
import { Protobuf } from "@meshtastic/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import NodesPage from "./index.tsx";

const mockNodes = [
  create(Protobuf.Mesh.NodeInfoSchema, {
    num: 0x10000000,
    lastHeard: 1_700_000_010,
    user: { longName: "Host Node", shortName: "ME" },
  }),
  create(Protobuf.Mesh.NodeInfoSchema, {
    num: 0x10000001,
    lastHeard: 1_700_000_000,
    user: {
      longName: "Far Node",
      shortName: "FAR",
      publicKey: new Uint8Array([1]),
    },
  }),
  create(Protobuf.Mesh.NodeInfoSchema, {
    num: 0x10000002,
    lastHeard: 1_700_000_001,
    user: { longName: "Unknown Relay Node", shortName: "UNK" },
  }),
  create(Protobuf.Mesh.NodeInfoSchema, {
    num: 0x10000003,
    lastHeard: 1_700_000_002,
    user: { longName: "Relayed Only", shortName: "REL" },
  }),
  create(Protobuf.Mesh.NodeInfoSchema, {
    num: 0x10000004,
    lastHeard: 1_700_000_003,
    user: { longName: "Encrypted Node", shortName: "ENC" },
  }),
  create(Protobuf.Mesh.NodeInfoSchema, {
    num: 0x10000005,
    lastHeard: 1_700_000_004,
    user: { longName: "Dead Transit", shortName: "DED" },
  }),
];

const mockMetadata = new Map([
  [
    0x10000001,
    {
      portnum: Protobuf.Portnums.PortNum.TELEMETRY_APP,
      packetState: "decoded",
      to: 0xffffffff,
      hopsAway: 2,
      viaMqtt: true,
      hopStart: 4,
      hopLimit: 2,
      relayNode: 0xab,
      transportMechanism: Protobuf.Mesh.MeshPacket_TransportMechanism.TRANSPORT_LORA,
      lastDirectHeard: 1_699_900_000,
      directSnr: 6,
      directRssi: -85,
      directSignalStale: true,
      relay: {
        status: "resolved",
        nodeNum: 0x200000ab,
        nodeName: "Direct Relay",
      },
    },
  ],
  [
    0x10000002,
    {
      portnum: Protobuf.Portnums.PortNum.POSITION_APP,
      packetState: "decoded",
      to: 0xffffffff,
      hopsAway: 0,
      viaMqtt: false,
      hopStart: 3,
      hopLimit: 2,
      relayNode: 0xcd,
      transportMechanism: Protobuf.Mesh.MeshPacket_TransportMechanism.TRANSPORT_LORA,
      lastDirectHeard: 1_700_000_001,
      directSnr: 5,
      directRssi: -88,
      directSignalStale: false,
      relay: { status: "unknown", relayNode: 0xcd },
    },
  ],
  [
    0x10000003,
    {
      portnum: Protobuf.Portnums.PortNum.NODEINFO_APP,
      packetState: "decoded",
      to: 0xffffffff,
      hopsAway: 1,
      viaMqtt: false,
      hopStart: 3,
      hopLimit: 2,
      relayNode: 0xef,
      transportMechanism: Protobuf.Mesh.MeshPacket_TransportMechanism.TRANSPORT_LORA,
      directSignalStale: false,
      relay: { status: "ambiguous", relayNode: 0xef },
    },
  ],
  [
    0x10000004,
    {
      packetState: "encrypted",
      to: 0xffffffff,
      hopsAway: 1,
      viaMqtt: false,
      hopStart: 3,
      hopLimit: 2,
      relayNode: 0,
      transportMechanism: Protobuf.Mesh.MeshPacket_TransportMechanism.TRANSPORT_LORA,
      directSignalStale: false,
      relay: { status: "unknown", relayNode: 0 },
    },
  ],
  [
    0x10000005,
    {
      packetState: "deadTransit",
      to: 0x20000000,
      hopsAway: 3,
      viaMqtt: false,
      hopStart: 3,
      hopLimit: 0,
      relayNode: 0,
      transportMechanism: Protobuf.Mesh.MeshPacket_TransportMechanism.TRANSPORT_LORA,
      directSignalStale: false,
      relay: { status: "unknown", relayNode: 0 },
    },
  ],
]);

vi.mock("@core/stores", () => ({
  useAppStore: () => ({ setNodeNumDetails: vi.fn() }),
  useDevice: () => ({
    hardware: { myNodeNum: 0x10000000 },
    connection: null,
    config: { lora: { modemPreset: 0 } },
    setDialogOpen: vi.fn(),
  }),
  useNodeDB: (selector: (db: any) => unknown) =>
    selector({
      getNodes: () => mockNodes,
      hasNodeError: () => false,
      getNodePacketMetadata: (nodeNum: number) => mockMetadata.get(nodeNum),
      nodePacketMetadata: mockMetadata,
      nodeErrors: new Map(),
    }),
}));

vi.mock("@core/hooks/useLang.ts", () => ({
  default: () => ({ current: { code: "en" } }),
}));

vi.mock("@core/hooks/useSonar.ts", () => ({
  useSonar: () => ({
    status: { phase: "idle", runId: null, endsAt: null },
    locked: false,
    start: vi.fn(),
    probe: vi.fn(),
    endRun: vi.fn(),
    isSonarResponsePacket: () => false,
  }),
}));

vi.mock("@core/stores/sonarStore/index.ts", () => ({
  useSonarStore: (selector: (state: any) => unknown) =>
    selector({ runsByDevice: {}, getRun: vi.fn() }),
}));

vi.mock("@components/PageLayout.tsx", () => ({
  PageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@components/Sidebar.tsx", () => ({
  Sidebar: () => null,
}));

vi.mock("@components/SonarModal.tsx", () => ({
  SonarModal: () => null,
}));

vi.mock("@components/SonarHistoryModal.tsx", () => ({
  SonarHistoryModal: () => null,
}));

vi.mock("@components/generic/Filter/FilterControl.tsx", () => ({
  FilterControl: () => null,
}));

vi.mock("@components/NodeContextMenu.tsx", () => ({
  NodeContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@components/UI/Avatar.tsx", () => ({
  Avatar: () => <span />,
}));

vi.mock("@app/components/Dialog/LocationResponseDialog.tsx", () => ({
  LocationResponseDialog: () => null,
}));

vi.mock("@app/components/Dialog/TracerouteResponseDialog.tsx", () => ({
  TracerouteResponseDialog: () => null,
}));

describe("Nodes table packet metadata", () => {
  it("renders packet reason, relay fallback states, stale signal, and no direct signal", () => {
    render(<NodesPage />);

    expect(screen.getByRole("columnheader", { name: /Packet/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Relayed by/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Encryption/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Host Node")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Telemetry")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Telemetry"));
    expect(screen.getByText("Latest decoded packet type: Telemetry.")).toBeInTheDocument();
    expect(screen.getByLabelText("Encrypted packet")).toBeInTheDocument();
    expect(screen.getByLabelText("No hops left")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Public key enabled"));
    expect(
      screen.getByText("Direct messages can use PKI encryption.", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Direct Relay")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByLabelText("Good direct signal (75%)")).toBeInTheDocument();
    expect(screen.queryByText("Direct")).not.toBeInTheDocument();
    expect(screen.getAllByText("1 Hop")).toHaveLength(2);
    expect(screen.getByLabelText("MQTT")).toBeInTheDocument();
    expect(screen.queryByText(/via MQTT/)).not.toBeInTheDocument();
    expect(screen.queryByText(/away/)).not.toBeInTheDocument();
    expect(screen.getByText("Unknown relay 0xCD")).toBeInTheDocument();
    expect(screen.getByText("Ambiguous relay 0xEF")).toBeInTheDocument();
    expect(screen.getByText(/\(stale\)/)).toBeInTheDocument();
    expect(screen.getAllByText("No direct signal")).toHaveLength(3);
  });
});
