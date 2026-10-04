import {
  nowIsoDateTime,
  todayIsoDate,
  type IsoDate,
  type IsoDateTime,
} from "@/domain/common/dates";

/** Injectable time source so services stay deterministic in tests. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function clockNow(clock: Clock): IsoDateTime {
  return nowIsoDateTime(clock.now());
}

export function clockToday(clock: Clock): IsoDate {
  return todayIsoDate(clock.now());
}
