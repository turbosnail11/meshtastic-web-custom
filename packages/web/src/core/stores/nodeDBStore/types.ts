import type { Protobuf } from "@meshtastic/core";

type NodeErrorType = Protobuf.Mesh.Routing_Error | "MISMATCH_PKI" | "DUPLICATE_PKI";

type NodeError = {
  node: number;
  error: NodeErrorType;
};

const DIRECT_SIGNAL_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

type RelayResolution =
  | {
      status: "none";
    }
  | {
      status: "resolved";
      nodeNum: number;
      nodeName: string;
    }
  | {
      status: "unknown" | "ambiguous";
      relayNode: number;
    };

type NodePacketMetadata = {
  portnum?: Protobuf.Portnums.PortNum;
  packetState: "decoded" | "encrypted" | "unknown" | "deadTransit";
  to: number;
  hopsAway: number;
  viaMqtt: boolean;
  hopStart: number;
  hopLimit: number;
  relayNode: number;
  transportMechanism: Protobuf.Mesh.MeshPacket_TransportMechanism;
  lastDirectHeard?: number;
  directSnr?: number;
  directRssi?: number;
};

type NodePacketMetadataView = NodePacketMetadata & {
  directSignalStale: boolean;
  relay: RelayResolution;
};

type ProcessPacketParams = {
  from: number;
  snr: number;
  rssi: number;
  time: number;
  portnum?: Protobuf.Portnums.PortNum;
  payloadVariant?: "decoded" | "encrypted";
  to: number;
  hopsAway: number;
  viaMqtt: boolean;
  hopStart: number;
  hopLimit: number;
  relayNode: number;
  transportMechanism: Protobuf.Mesh.MeshPacket_TransportMechanism;
};

export type {
  NodeError,
  NodePacketMetadata,
  NodePacketMetadataView,
  ProcessPacketParams,
  RelayResolution,
  NodeErrorType,
};
export { DIRECT_SIGNAL_STALE_AFTER_MS };
