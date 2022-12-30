import { HomeAssistant } from "custom-card-helpers";
import { Statistics, StatisticValue } from "../recorder-types";
import {
  CachedEntity,
  CachedStatisticsEntity,
  EntityIdStatisticsConfig,
} from "../types";

async function fetchStatistics(
  hass: HomeAssistant,
  entity: EntityIdStatisticsConfig,
  [start, end]: [Date, Date]
): Promise<CachedStatisticsEntity[]> {
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
  return (statistics || [])
    .map((statistics) => ({
      statistics,
      x: new Date(statistics.start),
      y: null, //depends on the statistic, will be set in getHistory
    }))
    .filter(({ x }) => x);
}
export default fetchStatistics;
