import { HomeAssistant } from "custom-card-helpers";
import { Statistics } from "../recorder-types";
import { CachedStatisticsEntity, StatisticsFetchConfig } from "../types";
import { requestCardData } from "./shared-requests";

async function fetchStatistics(
  hass: HomeAssistant,
  entities: StatisticsFetchConfig[],
  [start, end]: [Date, Date],
): Promise<Record<string, CachedStatisticsEntity[]>> {
  if (entities.length === 0) return {};
  const period = entities[0].period;
  if (entities.some((entity) => entity.period !== period)) {
    throw new Error("Cannot batch statistics with different periods");
  }
  const entityIds = [...new Set(entities.map(({ entity }) => entity))];
  const types = entities[0].types;
  let statistics: Statistics = {};
  try {
    const statsP = requestCardData(hass, {
      type: "recorder/statistics_during_period",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: entityIds,
      period,
      ...(types ? { types } : {}),
    });
    statistics = await statsP;
  } catch (e: any) {
    console.error(e);
    throw new Error(
      `Error fetching statistics of ${entityIds.join(", ")}: ${JSON.stringify(
        e.message || "",
      )}`,
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
    ]),
  );
}
export default fetchStatistics;
