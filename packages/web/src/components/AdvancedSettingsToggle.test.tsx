import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSetSimpleMode = vi.fn();
let currentSimpleMode = true;

vi.mock("@core/hooks/useSimpleMode.ts", () => ({
  useSimpleMode: () => currentSimpleMode,
  useSetSimpleMode: () => mockSetSimpleMode,
}));

import { AdvancedSettingsToggle } from "./AdvancedSettingsToggle.tsx";

describe("AdvancedSettingsToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSimpleMode = true;
  });

  it("renders with simpleMode default and switch unchecked", () => {
    render(<AdvancedSettingsToggle />);
    const sw = screen.getByTestId("advanced-settings-toggle-switch");
    expect(sw.getAttribute("data-state")).toBe("unchecked");
    expect(screen.getByText("Show advanced settings")).toBeInTheDocument();
  });

  it("renders as checked when simpleMode is false (advanced is on)", () => {
    currentSimpleMode = false;
    render(<AdvancedSettingsToggle />);
    const sw = screen.getByTestId("advanced-settings-toggle-switch");
    expect(sw.getAttribute("data-state")).toBe("checked");
  });

  it("calls setSimpleMode(false) when clicking from default state", async () => {
    const user = userEvent.setup();
    render(<AdvancedSettingsToggle />);
    const sw = screen.getByTestId("advanced-settings-toggle-switch");
    await user.click(sw);
    expect(mockSetSimpleMode).toHaveBeenCalledTimes(1);
    expect(mockSetSimpleMode).toHaveBeenCalledWith(false);
  });

  it("calls setSimpleMode(true) when clicking with advanced already on", async () => {
    currentSimpleMode = false;
    const user = userEvent.setup();
    render(<AdvancedSettingsToggle />);
    const sw = screen.getByTestId("advanced-settings-toggle-switch");
    await user.click(sw);
    expect(mockSetSimpleMode).toHaveBeenCalledWith(true);
  });
});
