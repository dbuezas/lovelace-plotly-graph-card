import { HomeAssistant } from "custom-card-helpers";
import { Statistics } from "../recorder-types";
import { CachedStatisticsEntity, EntityIdStatisticsConfig } from "../types";

async function fetchStatistics(
  hass: HomeAssistant,
  entities: EntityIdStatisticsConfig[],
  [start, end]: [Date, Date]
): Promise<Record<string, CachedStatisticsEntity[]>> {
  const entityIds = [...new Set(entities.map(({ entity }) => entity))];
  let statistics: Statistics = {};
  try {
    const statsP = hass.callWS<Statistics>({
      type: "recorder/statistics_during_period",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: entityIds,
      period: entities[0].period,
    });
    statistics = await statsP;
  } catch (e: any) {
    console.error(e);
    throw new Error(
      `Error fetching statistics of ${entityIds.join(", ")}: ${JSON.stringify(
        e.message || ""
      )}`
    );
  }
  return Object.fromEntries(
    entityIds.map((entityId) => [
      entityId,
      (statistics[entityId] || [])
        .map((statistics) => ({
          statistics,
          x: new Date(statistics.start),
          y: null, //depends on the statistic, will be set in getHistory
        }))
        .filter(({ x }) => x),
    ])
  );
}
export default fetchStatistics;
