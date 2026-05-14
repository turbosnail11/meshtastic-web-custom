import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSetSimpleMode = vi.fn();
let currentSimpleMode = true;

vi.mock("@core/stores", () => ({
  useAppStore: (
    selector: (s: { simpleMode: boolean; setSimpleMode: (v: boolean) => void }) => unknown,
  ) =>
    selector({
      simpleMode: currentSimpleMode,
      setSimpleMode: mockSetSimpleMode,
    }),
}));

import { useSetSimpleMode, useSimpleMode } from "./useSimpleMode.ts";

describe("useSimpleMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSimpleMode = true;
  });

  it("returns the current simpleMode value from the store", () => {
    const { result } = renderHook(() => useSimpleMode());
    expect(result.current).toBe(true);
  });

  it("reflects updated simpleMode value on re-render", () => {
    const { result, rerender } = renderHook(() => useSimpleMode());
    expect(result.current).toBe(true);

    currentSimpleMode = false;
    rerender();
    expect(result.current).toBe(false);
  });
});

describe("useSetSimpleMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSimpleMode = true;
  });

  it("returns the store's setSimpleMode setter", () => {
    const { result } = renderHook(() => useSetSimpleMode());
    act(() => {
      result.current(false);
    });
    expect(mockSetSimpleMode).toHaveBeenCalledWith(false);
  });
});
