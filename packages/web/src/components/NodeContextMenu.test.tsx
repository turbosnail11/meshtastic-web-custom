import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let simpleMode = true;

const mockTraceRoute = vi.fn().mockResolvedValue(0);
const mockRequestPosition = vi.fn().mockResolvedValue(0);
const mockRemoveNodeByNum = vi.fn().mockResolvedValue(0);
const mockNavigate = vi.fn();
const mockToast = vi.fn();
const mockCopy = vi.fn().mockResolvedValue(true);
const mockUpdateFavorite = vi.fn();
const mockUpdateIgnored = vi.fn();

vi.mock("@core/hooks/useSimpleMode.ts", () => ({
  useSimpleMode: () => simpleMode,
}));

vi.mock("@core/stores", () => ({
  useDevice: () => ({
    connection: {
      traceRoute: mockTraceRoute,
      requestPosition: mockRequestPosition,
      removeNodeByNum: mockRemoveNodeByNum,
    },
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@core/hooks/useToast.ts", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@core/hooks/useCopyToClipboard.ts", () => ({
  useCopyToClipboard: () => ({ copy: mockCopy, isCopied: false }),
}));

vi.mock("@core/hooks/useFavoriteNode.ts", () => ({
  useFavoriteNode: () => ({ updateFavorite: mockUpdateFavorite }),
}));

vi.mock("@core/hooks/useIgnoreNode.ts", () => ({
  useIgnoreNode: () => ({ updateIgnored: mockUpdateIgnored }),
}));

import { NodeContextMenu } from "./NodeContextMenu.tsx";

const fakeNode = {
  num: 0xabcd1234,
  isFavorite: false,
  isIgnored: false,
  user: {
    longName: "Test Node",
    shortName: "TST",
  },
} as never;

function openMenu() {
  fireEvent.contextMenu(screen.getByTestId("trigger"));
}

describe("NodeContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    simpleMode = true;
  });

  it("renders the node name as label", () => {
    render(
      <NodeContextMenu node={fakeNode}>
        <button type="button" data-testid="trigger">
          target
        </button>
      </NodeContextMenu>,
    );
    openMenu();
    expect(screen.getByText("Test Node")).toBeInTheDocument();
  });

  it("shows simple-mode actions and hides advanced-only actions when simpleMode is true", () => {
    render(
      <NodeContextMenu node={fakeNode}>
        <button type="button" data-testid="trigger">
          target
        </button>
      </NodeContextMenu>,
    );
    openMenu();
    expect(screen.getByTestId("action-send-message")).toBeInTheDocument();
    expect(screen.getByTestId("action-traceroute")).toBeInTheDocument();
    expect(screen.getByTestId("action-request-position")).toBeInTheDocument();
    expect(screen.getByTestId("action-favorite")).toBeInTheDocument();
    expect(screen.getByTestId("action-copy-id")).toBeInTheDocument();
    expect(screen.getByTestId("action-show-on-map")).toBeInTheDocument();
    expect(screen.queryByTestId("action-ignore")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-remove")).not.toBeInTheDocument();
  });

  it("shows advanced actions when simpleMode is false", () => {
    simpleMode = false;
    render(
      <NodeContextMenu node={fakeNode}>
        <button type="button" data-testid="trigger">
          target
        </button>
      </NodeContextMenu>,
    );
    openMenu();
    expect(screen.getByTestId("action-ignore")).toBeInTheDocument();
    expect(screen.getByTestId("action-remove")).toBeInTheDocument();
  });

  it("dispatches Trace Route on click", () => {
    render(
      <NodeContextMenu node={fakeNode}>
        <button type="button" data-testid="trigger">
          target
        </button>
      </NodeContextMenu>,
    );
    openMenu();
    fireEvent.click(screen.getByTestId("action-traceroute"));
    expect(mockTraceRoute).toHaveBeenCalledWith(0xabcd1234);
  });

  it("dispatches Request Position on click", () => {
    render(
      <NodeContextMenu node={fakeNode}>
        <button type="button" data-testid="trigger">
          target
        </button>
      </NodeContextMenu>,
    );
    openMenu();
    fireEvent.click(screen.getByTestId("action-request-position"));
    expect(mockRequestPosition).toHaveBeenCalledWith(0xabcd1234);
  });

  it("copies hex-formatted node ID to clipboard", () => {
    render(
      <NodeContextMenu node={fakeNode}>
        <button type="button" data-testid="trigger">
          target
        </button>
      </NodeContextMenu>,
    );
    openMenu();
    fireEvent.click(screen.getByTestId("action-copy-id"));
    expect(mockCopy).toHaveBeenCalledWith("!abcd1234");
  });

  it("toggles favorite", () => {
    render(
      <NodeContextMenu node={fakeNode}>
        <button type="button" data-testid="trigger">
          target
        </button>
      </NodeContextMenu>,
    );
    openMenu();
    fireEvent.click(screen.getByTestId("action-favorite"));
    expect(mockUpdateFavorite).toHaveBeenCalledWith({
      nodeNum: 0xabcd1234,
      isFavorite: true,
    });
  });

  it("navigates to direct message on Send Message", () => {
    render(
      <NodeContextMenu node={fakeNode}>
        <button type="button" data-testid="trigger">
          target
        </button>
      </NodeContextMenu>,
    );
    openMenu();
    fireEvent.click(screen.getByTestId("action-send-message"));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/messages/$type/$chatId",
      params: { type: "direct", chatId: String(0xabcd1234) },
    });
  });

  it("hides destination-only actions when isSelf is true", () => {
    render(
      <NodeContextMenu node={fakeNode} isSelf>
        <button type="button" data-testid="trigger">
          target
        </button>
      </NodeContextMenu>,
    );
    openMenu();
    expect(screen.queryByTestId("action-send-message")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-traceroute")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-request-position")).not.toBeInTheDocument();
    // Local-only actions still shown
    expect(screen.getByTestId("action-favorite")).toBeInTheDocument();
    expect(screen.getByTestId("action-copy-id")).toBeInTheDocument();
  });
});
