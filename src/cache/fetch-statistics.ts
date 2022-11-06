import { HomeAssistant } from "custom-card-helpers";
import { Statistics, StatisticValue } from "../recorder-types";
import { EntityIdStatisticsConfig, EntityState } from "../types";

async function fetchStatistics(
  hass: HomeAssistant,
  entity: EntityIdStatisticsConfig,
  [start, end]: [Date, Date]
): Promise<EntityState[]> {
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
  return statistics.map((entry) => ({
    ...entry,
    timestamp: +new Date(entry.start),
    value: entry[entity.statistic] ?? "",
  }));
}
export default fetchStatistics;
