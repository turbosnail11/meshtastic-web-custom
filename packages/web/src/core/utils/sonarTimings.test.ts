import { Protobuf } from "@meshtastic/core";
import { describe, expect, it } from "vitest";
import { SONAR_COOLDOWN_BUFFER_MS, sonarWindowMs, totalSonarLockMs } from "./sonarTimings.ts";

const Preset = Protobuf.Config.Config_LoRaConfig_ModemPreset;

describe("sonarWindowMs", () => {
  it("returns a longer window for slower presets", () => {
    expect(sonarWindowMs(Preset.SHORT_FAST)).toBeLessThan(sonarWindowMs(Preset.LONG_FAST));
    expect(sonarWindowMs(Preset.LONG_FAST)).toBeLessThan(sonarWindowMs(Preset.LONG_SLOW));
    expect(sonarWindowMs(Preset.LONG_SLOW)).toBeLessThan(sonarWindowMs(Preset.VERY_LONG_SLOW));
  });

  it("defaults to LongFast window for unknown preset values", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sonarWindowMs(9999 as any)).toBe(sonarWindowMs(Preset.LONG_FAST));
  });
});

describe("totalSonarLockMs", () => {
  it("equals 2× window plus the cooldown buffer", () => {
    const w = sonarWindowMs(Preset.LONG_FAST);
    expect(totalSonarLockMs(Preset.LONG_FAST)).toBe(w * 2 + SONAR_COOLDOWN_BUFFER_MS);
  });
});
