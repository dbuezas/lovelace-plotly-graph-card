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
};
type DataRequest = HistoryRequest | StatisticsRequest;
type DataResponse = Record<string, (HistoryState | StatisticValue)[]>;
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
  consumers: Consumer[];
};

const scopes = new WeakMap<object, SharedRequests>();

function ids(request: DataRequest) {
  return request.type === "history/history_during_period"
    ? request.entity_ids
    : request.statistic_ids;
}

function key(request: DataRequest) {
  return JSON.stringify(
    Object.entries(request)
      .filter(([name]) => name !== "entity_ids" && name !== "statistic_ids")
      .sort(([a], [b]) => a.localeCompare(b)),
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
    let group = this.groups.find(
      (group) =>
        group.key === optionsKey &&
        (!group.sent ||
          ids(request).every((id) => ids(group.request).includes(id))),
    );
    if (!group) {
      group = {
        key: optionsKey,
        hass,
        request: structuredClone(request),
        sent: false,
        consumers: [],
      };
      this.groups.push(group);
    } else if (!group.sent) {
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
      for (const consumer of group.consumers) {
        const selected = Object.fromEntries(
          ids(consumer.request)
            .filter((id) => id in response)
            .map((id) => [id, response[id]]),
        );
        // Filters may mutate rows and nested attributes. Each card owns its data.
        consumer.resolve(
          group.consumers.length === 1 ? response : structuredClone(selected),
        );
      }
    } catch (error) {
      const invalidIds =
        group.request.type === "history/history_during_period" &&
        (error as { code?: string } | null)?.code === "invalid_entity_ids";
      for (const consumer of group.consumers) {
        // A malformed ID in one card must not break other cards in the batch.
        if (invalidIds && group.consumers.length > 1)
          void Promise.resolve()
            .then(() => group.hass.callWS<DataResponse>(consumer.request))
            .then(consumer.resolve, consumer.reject);
        else consumer.reject(error);
      }
    } finally {
      this.groups.splice(this.groups.indexOf(group), 1);
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
