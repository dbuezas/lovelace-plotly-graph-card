import { HomeAssistant } from "custom-card-helpers";
import { Statistics, StatisticValue } from "../recorder-types";
import { EntityIdStatisticsConfig, HistoryInRange } from "../types";
import { sleep } from "../utils";

async function fetchStatistics(
  hass: HomeAssistant,
  entity: EntityIdStatisticsConfig,
  [start, end]: [Date, Date]
): Promise<HistoryInRange> {
  let statistics: StatisticValue[] | null = null;
  try {
    const statsP = hass.callWS<Statistics>({
      type: "recorder/statistics_during_period",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: [entity.entity],
      period: entity.period,
    });
    statistics = (await statsP)[entity.entity];
  } catch (e: any) {
    console.error(e);
    throw new Error(
      `Error fetching statistics of ${entity.entity}: ${JSON.stringify(
        e.message || ""
      )}`
    );
  }
  if (!statistics) statistics = []; //throw new Error(`Error fetching ${entity.entity}`);
  return {
    range: [+start, +end],
    history: statistics.map((entry) => {
      return {
        entity_id: entry.statistic_id,
        last_updated: +new Date(entry.start),
        last_changed: +new Date(entry.start),
        state: entry[entity.statistic] ?? "",
        statistics: entry,
        attributes: {},
      };
    }),
  };
}
export default fetchStatistics;
