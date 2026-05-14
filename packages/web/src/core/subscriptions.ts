import { fromBinary } from "@bufbuild/protobuf";
import PacketToMessageDTO, { type RichMeta } from "@core/dto/PacketToMessageDTO.ts";
import { useNewNodeNum } from "@core/hooks/useNewNodeNum";
import { type Device, type MessageStore, MessageType, type NodeDB } from "@core/stores";
import { type MeshDevice, Protobuf } from "@meshtastic/core";
export const subscribeAll = (
  device: Device,
  connection: MeshDevice,
  messageStore: MessageStore,
  nodeDB: NodeDB,
) => {
  let myNodeNum = 0;
  // Buffer rich packet metadata keyed by packet ID so onMessagePacket can
  // pick it up. onMeshPacket fires before the specialized events in the core.
  const pendingRichMeta = new Map<number, RichMeta>();

  connection.events.onDeviceMetadataPacket.subscribe((metadataPacket) => {
    device.addMetadata(metadataPacket.from, metadataPacket.data);
  });

  connection.events.onRoutingPacket.subscribe((routingPacket) => {
    switch (routingPacket.data.variant.case) {
      case "errorReason": {
        if (routingPacket.data.variant.value === Protobuf.Mesh.Routing_Error.NONE) {
          return;
        }
        console.info(`Routing Error: ${routingPacket.data.variant.value}`);
        break;
      }
      case "routeReply": {
        console.info(`Route Reply: ${routingPacket.data.variant.value}`);
        break;
      }
      case "routeRequest": {
        console.info(`Route Request: ${routingPacket.data.variant.value}`);
        break;
      }
    }
  });

  connection.events.onTelemetryPacket.subscribe(() => {
    // device.setMetrics(telemetryPacket);
  });

  connection.events.onDeviceStatus.subscribe((status) => {
    device.setStatus(status);
  });

  connection.events.onWaypointPacket.subscribe((waypoint) => {
    const { data, channel, from, rxTime } = waypoint;
    device.addWaypoint(data, channel, from, rxTime);
  });

  connection.events.onMyNodeInfo.subscribe((nodeInfo) => {
    useNewNodeNum(device.id, nodeInfo);
    myNodeNum = nodeInfo.myNodeNum;
  });

  connection.events.onUserPacket.subscribe((user) => {
    nodeDB.addUser(user);
  });

  connection.events.onPositionPacket.subscribe((position) => {
    nodeDB.addPosition(position);
  });

  // NOTE: Node handling is managed by the nodeDB
  // Nodes are added via subscriptions.ts and stored in nodeDB
  // Configuration is handled directly by meshDevice.configure() in useConnections
  connection.events.onNodeInfoPacket.subscribe((nodeInfo) => {
    nodeDB.addNode(nodeInfo);
  });

  connection.events.onChannelPacket.subscribe((channel) => {
    device.addChannel(channel);
  });
  connection.events.onConfigPacket.subscribe((config) => {
    device.setConfig(config);
  });
  connection.events.onModuleConfigPacket.subscribe((moduleConfig) => {
    device.setModuleConfig(moduleConfig);
  });

  connection.events.onMessagePacket.subscribe((messagePacket) => {
    // incoming and outgoing messages are handled by this event listener
    const richMeta = pendingRichMeta.get(messagePacket.id);
    if (richMeta) pendingRichMeta.delete(messagePacket.id);
    const dto = new PacketToMessageDTO(messagePacket, myNodeNum, richMeta);
    const message = dto.toMessage();
    messageStore.saveMessage(message);

    if (message.type === MessageType.Direct) {
      if (message.to === myNodeNum) {
        device.incrementUnread(messagePacket.from);
      }
    } else if (message.type === MessageType.Broadcast) {
      if (message.from !== myNodeNum) {
        device.incrementUnread(message.channel);
      }
    }
  });

  connection.events.onTraceRoutePacket.subscribe((traceRoutePacket) => {
    device.addTraceRoute({
      ...traceRoutePacket,
    });
  });

  connection.events.onPendingSettingsChange.subscribe((state) => {
    device.setPendingSettingsChanges(state);
  });

  connection.events.onMeshPacket.subscribe((meshPacket) => {
    const portnum =
      meshPacket.payloadVariant.case === "decoded"
        ? meshPacket.payloadVariant.value.portnum
        : undefined;
    const hopsAway = Math.max(0, meshPacket.hopStart - meshPacket.hopLimit);
    const transportMechanism = meshPacket.transportMechanism;
    const viaMqtt =
      meshPacket.viaMqtt ||
      transportMechanism === Protobuf.Mesh.MeshPacket_TransportMechanism.TRANSPORT_MQTT;

    // Routing ack — record who acknowledged our sent message.
    // proto3 serializes NONE (value 0) as an empty payload, so we can't rely
    // on parsing the Routing message: a successful ack often comes through as
    // empty bytes. Instead, treat any non-error routing response that targets
    // one of our outgoing packets as an ack.
    if (
      portnum === Protobuf.Portnums.PortNum.ROUTING_APP &&
      meshPacket.payloadVariant.case === "decoded"
    ) {
      const decoded = meshPacket.payloadVariant.value;
      console.debug(
        "[ack] ROUTING_APP from=0x%s requestId=%d payloadBytes=%d",
        meshPacket.from.toString(16),
        decoded.requestId,
        decoded.payload.length,
      );
      if (decoded.requestId !== 0) {
        let isError = false;
        try {
          const routing = fromBinary(Protobuf.Mesh.RoutingSchema, decoded.payload);
          if (
            routing.variant.case === "errorReason" &&
            routing.variant.value !== Protobuf.Mesh.Routing_Error.NONE
          ) {
            isError = true;
          }
        } catch {
          // empty/unparseable payload = NONE ack
        }
        if (!isError && meshPacket.from !== myNodeNum) {
          console.debug(
            "[ack] -> setMessageAckedBy(%d, 0x%s)",
            decoded.requestId,
            meshPacket.from.toString(16),
          );
          messageStore.setMessageAckedBy(decoded.requestId, meshPacket.from);
        } else if (!isError) {
          console.debug(
            "[ack] -> self-originated routing ack for messageId=%d, skipping ackedBy attribution",
            decoded.requestId,
          );
        } else {
          console.debug("[ack] -> error response, skipping");
        }
      }
    }

    if (portnum === Protobuf.Portnums.PortNum.TEXT_MESSAGE_APP) {
      const replyId =
        meshPacket.payloadVariant.case === "decoded"
          ? meshPacket.payloadVariant.value.replyId
          : undefined;
      pendingRichMeta.set(meshPacket.id, {
        rxSnr: meshPacket.rxSnr,
        rxRssi: meshPacket.rxRssi,
        hopsAway,
        hopStart: meshPacket.hopStart,
        hopLimit: meshPacket.hopLimit,
        viaMqtt,
        priority: meshPacket.priority,
        wantAck: meshPacket.wantAck,
        replyId: replyId && replyId !== 0 ? replyId : undefined,
      });
    }

    nodeDB.processPacket({
      from: meshPacket.from,
      to: meshPacket.to,
      snr: meshPacket.rxSnr,
      rssi: meshPacket.rxRssi,
      time: meshPacket.rxTime,
      portnum,
      payloadVariant: meshPacket.payloadVariant.case ?? undefined,
      hopsAway,
      viaMqtt,
      hopStart: meshPacket.hopStart,
      hopLimit: meshPacket.hopLimit,
      relayNode: meshPacket.relayNode,
      transportMechanism,
    });
  });

  connection.events.onClientNotificationPacket.subscribe((clientNotificationPacket) => {
    device.addClientNotification(clientNotificationPacket);
    device.setDialogOpen("clientNotification", true);
  });

  connection.events.onNeighborInfoPacket.subscribe((neighborInfo) => {
    device.addNeighborInfo(neighborInfo.from, neighborInfo.data);
  });

  connection.events.onRoutingPacket.subscribe((routingPacket) => {
    if (routingPacket.data.variant.case === "errorReason") {
      switch (routingPacket.data.variant.value) {
        case Protobuf.Mesh.Routing_Error.MAX_RETRANSMIT:
          console.error(`Routing Error: ${routingPacket.data.variant.value}`);
          break;
        case Protobuf.Mesh.Routing_Error.NO_CHANNEL:
          console.error(`Routing Error: ${routingPacket.data.variant.value}`);
          nodeDB.setNodeError(routingPacket.from, routingPacket?.data?.variant?.value);
          device.setDialogOpen("refreshKeys", true);
          break;
        case Protobuf.Mesh.Routing_Error.PKI_UNKNOWN_PUBKEY:
          console.error(`Routing Error: ${routingPacket.data.variant.value}`);
          nodeDB.setNodeError(routingPacket.from, routingPacket?.data?.variant?.value);
          device.setDialogOpen("refreshKeys", true);
          break;
        default: {
          break;
        }
      }
    }
  });
};
