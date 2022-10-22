import { HomeAssistant } from "custom-card-helpers";
import {
  StatisticPeriod,
  Statistics,
  StatisticType,
  StatisticValue,
} from "./recorder-types";
import { sleep } from "./utils";

async function fetchStatistics(
  hass: HomeAssistant,
  entityIdWithAttribute: string,
  entityId: string,
  [start, end]: [Date, Date],
  statType: StatisticType,
  statPeriod: StatisticPeriod = "5minute"
) {
  if (!["min", "mean", "max", "sum"].includes(statType)) return null;
  if (!["5minute", "hour", "day", "month"].includes(statPeriod)) return null;

  let statistics: StatisticValue[] | null = null;
  let succeeded = false;
  let retries = 0;
  while (!succeeded) {
    try {
      const statsP = hass.callWS<Statistics>({
        type: "recorder/statistics_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: [entityId],
        period: statPeriod,
      });
      statistics = (await statsP)[entityId];
      succeeded = true;
    } catch (e) {
      console.error(e);
      retries++;
      if (retries > 50) return null;
      await sleep(100);
    }
  }
  if (!statistics || statistics.length == 0) return null;
  const attributes = {
    unit_of_measurement:
      hass.states[entityId]?.attributes.unit_of_measurement || "",
    friendly_name: `${
      hass.states[entityId]?.attributes.friendly_name || ""
    }(${statType})`,
  };
  return {
    entityId: entityIdWithAttribute,
    range: [+start, +end],
    attributes,
    history: statistics.map((entry) => {
      const last_updated =
        (new Date(entry.start).getTime() + new Date(entry.end).getTime()) / 2;
      return {
        entity_id: entityId,
        last_updated,
        last_changed: last_updated,
        state: entry[statType] ?? "",
        statistics: entry,
        attributes,
      };
    }),
  };
}
export default fetchStatistics;
