import type { HomeAssistant } from "custom-card-helpers";
import type {
  Statistics,
  StatisticPeriod,
  StatisticValue,
} from "../recorder-types";
import type { HistoryResponse, HistoryState } from "./fetch-states";

export type HistoryRequest = {
  type: "history/history_during_period";
  start_time: string;
  end_time: string;
  entity_ids: string[];
  include_start_time_state: boolean;
  significant_changes_only: boolean;
  minimal_response: boolean;
  no_attributes: boolean;
};
export type StatisticsRequest = {
  type: "recorder/statistics_during_period";
  start_time: string;
  end_time: string;
  statistic_ids: string[];
  period: StatisticPeriod;
  types?: string[];
};
type DataRequest = HistoryRequest | StatisticsRequest;
type DataRow = HistoryState | StatisticValue;
type DataResponse = Record<string, DataRow[]>;
type Consumer = {
  request: DataRequest;
  resolve: (response: DataResponse) => void;
  reject: (error: unknown) => void;
};
type Group = {
  key: string;
  hass: HomeAssistant;
  request: DataRequest;
  sent: boolean;
  minStart: number;
  maxStart: number;
  minEnd: number;
  maxEnd: number;
  consumers: Consumer[];
};

// Only a small envelope is widened, never the card's actual visible range.
const MAX_HISTORY_DRIFT_MS = 1000;
const scopes = new WeakMap<object, SharedRequests>();

function ids(request: DataRequest) {
  return request.type === "history/history_during_period"
    ? request.entity_ids
    : request.statistic_ids;
}

function key(request: DataRequest) {
  const { start_time, end_time, ...options } = request;
  if (options.type === "history/history_during_period") {
    const { entity_ids, ...flags } = options;
    return JSON.stringify(
      Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  const { statistic_ids, ...flags } = options;
  return JSON.stringify(
    Object.entries({
      ...flags,
      types: flags.types && [...new Set(flags.types)].sort(),
    }).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function canProject(request: DataRequest): request is HistoryRequest {
  return (
    request.type === "history/history_during_period" &&
    request.include_start_time_state &&
    !request.significant_changes_only &&
    request.minimal_response &&
    request.no_attributes
  );
}

function isHistory(row: DataRow): row is HistoryState {
  return "s" in row || ("state" in row && typeof row.state === "string");
}

function timestampSeconds(row: HistoryState) {
  return "s" in row
    ? row.lu
    : Date.parse(row.last_updated || row.last_changed) / 1000;
}

function projectHistory(rows: HistoryState[], start: number, end: number) {
  let previous: HistoryState | undefined;
  const selected: HistoryState[] = [];
  for (const row of rows) {
    const time = timestampSeconds(row);
    if (time <= start / 1000) previous = row;
    else if (time < end / 1000) selected.push(row);
  }
  if (previous) {
    // HA synthesizes a boundary state with both timestamps at the start.
    const boundary =
      "s" in previous
        ? {
            s: previous.s,
            lu: start / 1000,
            ...("a" in previous ? { a: previous.a } : {}),
          }
        : {
            ...previous,
            last_changed: new Date(start).toISOString(),
            last_updated: new Date(start).toISOString(),
          };
    selected.unshift(boundary);
  }
  return selected;
}

function project(response: DataResponse, group: Group, consumer: Consumer) {
  const request = consumer.request;
  const differentRange =
    request.start_time !== group.request.start_time ||
    request.end_time !== group.request.end_time;
  const selected: DataResponse = {};
  for (const id of ids(request)) {
    if (!(id in response)) continue;
    const rows = response[id];
    selected[id] =
      differentRange && canProject(request)
        ? projectHistory(
            rows.filter(isHistory),
            Date.parse(request.start_time),
            Date.parse(request.end_time),
          )
        : rows;
  }
  // Filters may mutate rows and nested attributes. Each card owns its response.
  return structuredClone(selected);
}

function needsSeparateBoundaryRequest(
  response: DataResponse,
  group: Group,
  request: DataRequest,
) {
  if (!canProject(request)) return false;
  const start = Date.parse(request.start_time);
  if (start === group.minStart) return false;
  // HA excludes measurements exactly at the start. Minimal history can omit
  // later equal states, so this boundary cannot be reconstructed reliably.
  return ids(request).some((id) =>
    response[id]?.some((row) => isHistory(row) && timestampSeconds(row) === start / 1000),
  );
}

class SharedRequests {
  private groups: Group[] = [];
  private scheduled = false;

  request(hass: HomeAssistant, request: DataRequest): Promise<DataResponse> {
    const start = Date.parse(request.start_time);
    const end = Date.parse(request.end_time);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start > end ||
      start > Date.now() ||
      !ids(request).length
    ) {
      return hass.callWS<DataResponse>(request);
    }
    const optionsKey = key(request);
    let group = this.groups.find((group) => {
      if (group.key !== optionsKey) return false;
      if (group.sent) {
        return (
          ids(request).every((id) => ids(group.request).includes(id)) &&
          (canProject(request)
            ? start >= group.minStart && end <= group.maxEnd
            : start === group.minStart && end === group.maxEnd)
        );
      }
      if (!canProject(request))
        return start === group.minStart && end === group.maxEnd;
      return (
        Math.max(start, group.maxStart) - Math.min(start, group.minStart) <=
          MAX_HISTORY_DRIFT_MS &&
        Math.max(end, group.maxEnd) - Math.min(end, group.minEnd) <=
          MAX_HISTORY_DRIFT_MS
      );
    });
    if (!group) {
      group = {
        key: optionsKey,
        hass,
        request: structuredClone(request),
        sent: false,
        minStart: start,
        maxStart: start,
        minEnd: end,
        maxEnd: end,
        consumers: [],
      };
      this.groups.push(group);
    } else if (!group.sent) {
      group.minStart = Math.min(group.minStart, start);
      group.maxStart = Math.max(group.maxStart, start);
      group.minEnd = Math.min(group.minEnd, end);
      group.maxEnd = Math.max(group.maxEnd, end);
      group.request.start_time = new Date(group.minStart).toISOString();
      group.request.end_time = new Date(group.maxEnd).toISOString();
      const mergedIds = [...new Set([...ids(group.request), ...ids(request)])];
      if (group.request.type === "history/history_during_period")
        group.request.entity_ids = mergedIds;
      else group.request.statistic_ids = mergedIds;
    }
    const target = group;
    const promise = new Promise<DataResponse>((resolve, reject) => {
      target.consumers.push({
        request: structuredClone(request),
        resolve,
        reject,
      });
    });
    if (!target.sent && !this.scheduled) {
      this.scheduled = true;
      // Collect this event-loop turn without an arbitrary batching delay.
      setTimeout(() => {
        this.scheduled = false;
        for (const group of this.groups.filter((group) => !group.sent))
          void this.dispatch(group);
      }, 0);
    }
    return promise;
  }

  private async dispatch(group: Group) {
    group.sent = true;
    try {
      const response =
        (await group.hass.callWS<DataResponse>(group.request)) || {};
      for (const consumer of group.consumers)
        void this.respond(group, consumer, response);
    } catch (error) {
      for (const consumer of group.consumers) consumer.reject(error);
    } finally {
      this.groups.splice(this.groups.indexOf(group), 1);
    }
  }

  private async respond(group: Group, consumer: Consumer, response: DataResponse) {
    try {
      const selected = needsSeparateBoundaryRequest(response, group, consumer.request)
        ? await group.hass.callWS<DataResponse>(structuredClone(consumer.request))
        : group.consumers.length === 1
          ? response
          : project(response, group, consumer);
      consumer.resolve(selected || {});
    } catch (error) {
      consumer.reject(error);
    }
  }
}

export function requestCardData(
  hass: HomeAssistant,
  request: HistoryRequest,
): Promise<HistoryResponse>;
export function requestCardData(
  hass: HomeAssistant,
  request: StatisticsRequest,
): Promise<Statistics>;
export function requestCardData(
  hass: HomeAssistant,
  request: DataRequest,
): Promise<DataResponse> {
  // HA replaces its state object frequently; the connection is the security scope.
  const scope = hass.connection ?? hass.callWS;
  let shared = scopes.get(scope);
  if (!shared) scopes.set(scope, (shared = new SharedRequests()));
  return shared.request(hass, request);
}
