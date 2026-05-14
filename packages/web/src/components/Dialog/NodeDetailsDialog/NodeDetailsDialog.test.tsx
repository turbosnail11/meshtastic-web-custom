import { fireEvent, render, screen } from "@testing-library/react";
import { Protobuf } from "@meshtastic/core";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentNode: undefined as Protobuf.Mesh.NodeInfo | undefined,
  navigate: vi.fn(),
  onOpenChange: vi.fn(),
  requestPosition: vi.fn().mockResolvedValue(0),
  sendPacket: vi.fn().mockResolvedValue(0),
  setDialogOpen: vi.fn(),
  setNodeNumToBeRemoved: vi.fn(),
  toast: vi.fn(),
  traceRoute: vi.fn().mockResolvedValue(0),
  updateFavorite: vi.fn(),
  updateIgnored: vi.fn(),
}));

vi.mock("@core/stores", () => ({
  useDevice: () => ({
    connection: {
      requestPosition: mocks.requestPosition,
      sendPacket: mocks.sendPacket,
      traceRoute: mocks.traceRoute,
    },
    setDialogOpen: mocks.setDialogOpen,
  }),
  useNodeDB: () => ({
    getNode: () => mocks.currentNode,
    getNodePacketMetadata: () => undefined,
  }),
  useAppStore: () => ({
    nodeNumDetails: mocks.currentNode?.num ?? 0,
    setNodeNumToBeRemoved: mocks.setNodeNumToBeRemoved,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@core/hooks/useToast.ts", () => ({
  toast: mocks.toast,
}));

vi.mock("@core/hooks/useFavoriteNode.ts", () => ({
  useFavoriteNode: () => ({ updateFavorite: mocks.updateFavorite }),
}));

vi.mock("@core/hooks/useIgnoreNode.ts", () => ({
  useIgnoreNode: () => ({ updateIgnored: mocks.updateIgnored }),
}));

vi.mock("@components/UI/Tabs.tsx", async () => {
  const React = await import("react");
  const TabsContext = React.createContext<{
    value: string;
    setValue: (value: string) => void;
  } | null>(null);

  return {
    Tabs: ({ defaultValue, children }: { defaultValue: string; children: ReactNode }) => {
      const [value, setValue] = React.useState(defaultValue);
      return <TabsContext.Provider value={{ value, setValue }}>{children}</TabsContext.Provider>;
    },
    TabsList: ({ children }: { children: ReactNode }) => <div role="tablist">{children}</div>,
    TabsTrigger: ({ value, children }: { value: string; children: ReactNode }) => {
      const context = React.useContext(TabsContext);
      return (
        <button
          type="button"
          role="tab"
          aria-selected={context?.value === value}
          onClick={() => context?.setValue(value)}
        >
          {children}
        </button>
      );
    },
    TabsContent: ({ value, children }: { value: string; children: ReactNode }) => {
      const context = React.useContext(TabsContext);
      return context?.value === value ? <div role="tabpanel">{children}</div> : null;
    },
  };
});

import { NodeDetailsDialog } from "./NodeDetailsDialog.tsx";

const baseNode = {
  num: 0xabcd1234,
  lastHeard: 1_700_000_000,
  isFavorite: false,
  isIgnored: false,
  isKeyManuallyVerified: true,
  user: {
    longName: "Ridge Relay",
    shortName: "RDG",
    role: Protobuf.Config.Config_DeviceConfig_Role.REPEATER,
    hwModel: Protobuf.Mesh.HardwareModel.HELTEC_V3,
    publicKey: new Uint8Array([1, 2, 3]),
    isUnmessagable: false,
  },
  position: {
    latitudeI: 377749000,
    longitudeI: -1224194000,
    altitude: 42,
  },
  deviceMetrics: {
    batteryLevel: 87,
    voltage: 4.12,
    channelUtilization: 12.34,
    airUtilTx: 5.67,
    uptimeSeconds: 3661,
  },
} as Protobuf.Mesh.NodeInfo;

function renderDialog(node: Protobuf.Mesh.NodeInfo = baseNode) {
  mocks.currentNode = node;
  return render(<NodeDetailsDialog open onOpenChange={mocks.onOpenChange} />);
}

function selectTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.pointerUp(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
}

describe("NodeDetailsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentNode = baseNode;
  });

  it("uses the long name as the dialog title", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Ridge Relay" })).toBeInTheDocument();
  });

  it("uses a friendly fallback when the long name is missing or only the node id", () => {
    renderDialog({
      ...baseNode,
      user: {
        ...baseNode.user,
        longName: "!abcd1234",
        shortName: "RDG",
      },
    } as Protobuf.Mesh.NodeInfo);

    expect(screen.getByRole("heading", { name: "Meshtastic RDG" })).toBeInTheDocument();
  });

  it("renders the expected action row", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request Node Info" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request Position" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trace Route" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to favorites" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ignore node" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove node" })).toBeInTheDocument();
  });

  it("requests node info with NODEINFO_APP", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Request Node Info" }));

    expect(mocks.sendPacket).toHaveBeenCalledWith(
      new Uint8Array(),
      Protobuf.Portnums.PortNum.NODEINFO_APP,
      0xabcd1234,
    );
  });

  it("renders overview identifiers, hardware, and security status", () => {
    renderDialog();

    expect(screen.getByText("Node number")).toBeInTheDocument();
    expect(screen.getByText("2882343476")).toBeInTheDocument();
    expect(screen.getAllByText("abcd1234")).toHaveLength(2);
    expect(screen.getAllByText("HELTEC V3").length).toBeGreaterThan(0);
    expect(screen.getByText("Public key")).toBeInTheDocument();
    expect(screen.getByText("Present")).toBeInTheDocument();
    expect(screen.getAllByText("Key verified").length).toBeGreaterThan(0);
  });

  it("renders coordinates on the location tab", () => {
    renderDialog();

    selectTab("Location");

    const coordinates = screen.getByRole("link", { name: "37.7749, -122.4194" });
    expect(coordinates).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/?mlat=37.7749&mlon=-122.4194&layers=N",
    );
    expect(screen.getByText("42m")).toBeInTheDocument();
  });

  it("renders an empty state when no position is known", () => {
    renderDialog({
      ...baseNode,
      position: undefined,
    } as Protobuf.Mesh.NodeInfo);

    selectTab("Location");

    expect(screen.getByText("No position known")).toBeInTheDocument();
  });

  it("renders diagnostics metrics and keeps raw JSON behind a collapsed accordion", () => {
    renderDialog();

    selectTab("Diagnostics");

    expect(screen.getByText("Battery level")).toBeInTheDocument();
    expect(screen.getByText("87.00%")).toBeInTheDocument();
    expect(screen.getByText("Channel utilization")).toBeInTheDocument();
    expect(screen.getByText("12.34%")).toBeInTheDocument();
    expect(screen.getByText("0d 1h 1m 1s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Raw Metrics:" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("renders an empty diagnostics state when metrics are missing", () => {
    renderDialog({
      ...baseNode,
      deviceMetrics: undefined,
    } as Protobuf.Mesh.NodeInfo);

    selectTab("Diagnostics");

    expect(screen.getByText("No device metrics")).toBeInTheDocument();
  });
});
