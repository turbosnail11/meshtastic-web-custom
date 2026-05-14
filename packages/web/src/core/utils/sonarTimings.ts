import { Protobuf } from "@meshtastic/core";

/**
 * Recommended listening window (milliseconds) for a sonar probe at a given
 * modem preset. Slower presets (longer time-on-air per packet) need a longer
 * window to allow round-trips and CSMA backoff from each direct neighbor.
 *
 * These values are pragmatic defaults derived from typical SF/BW combinations,
 * not exact calculations.
 */
export function sonarWindowMs(preset: Protobuf.Config.Config_LoRaConfig_ModemPreset): number {
  const Preset = Protobuf.Config.Config_LoRaConfig_ModemPreset;
  switch (preset) {
    case Preset.SHORT_TURBO:
    case Preset.SHORT_FAST:
      return 10_000;
    case Preset.SHORT_SLOW:
    case Preset.MEDIUM_FAST:
      return 15_000;
    case Preset.MEDIUM_SLOW:
      return 20_000;
    case Preset.LONG_FAST:
      return 30_000;
    case Preset.LONG_TURBO:
      return 15_000;
    case Preset.LONG_MODERATE:
      return 45_000;
    case Preset.LONG_SLOW:
      return 60_000;
    case Preset.VERY_LONG_SLOW:
      return 90_000;
    default:
      return 30_000;
  }
}

/**
 * Buffer added after both phases finish before the sonar button re-enables.
 * Prevents accidental immediate re-fires.
 */
export const SONAR_COOLDOWN_BUFFER_MS = 5_000;

/**
 * Total locked time for the button (Phase 1 + Phase 2 + buffer). Phase 2
 * uses the same window as Phase 1 since enrichment is similar round-trip work.
 */
export function totalSonarLockMs(preset: Protobuf.Config.Config_LoRaConfig_ModemPreset): number {
  const window = sonarWindowMs(preset);
  return window * 2 + SONAR_COOLDOWN_BUFFER_MS;
}
