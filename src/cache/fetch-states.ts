import { HomeAssistant } from "custom-card-helpers";
import {
  CachedStateEntity,
  EntityIdAttrConfig,
  EntityIdStateConfig,
  HassEntity,
  isEntityIdAttrConfig,
} from "../types";

function mapStates(list: HassEntity[] | undefined): CachedStateEntity[] {
  return (list || [])
    .map((state) => ({
      state,
      x: new Date(state.last_updated || state.last_changed),
      y: null, // may be state or an attribute. Will be set when getting the history
    }))
    .filter(({ x }) => x);
}

export async function fetchStatesBatch(
  hass: HomeAssistant,
  entities: (EntityIdStateConfig | EntityIdAttrConfig)[],
  [start, end]: [Date, Date],
): Promise<Record<string, CachedStateEntity[]>> {
  const entityIds = [...new Set(entities.map(({ entity }) => entity))];
  if (!entityIds.length) return {};
  const includeAttributes = entities.some(isEntityIdAttrConfig);
  const uri =
    `history/period/${start.toISOString()}?` +
    [
      `filter_entity_id=${entityIds.join(",")}`,
      `significant_changes_only=0`,
      includeAttributes ? "" : "no_attributes",
      includeAttributes ? "" : "minimal_response",
      `end_time=${end.toISOString()}`,
    ]
      .filter(Boolean)
      .join("&");
  let lists: HassEntity[][];
  try {
    lists = (await hass.callApi("GET", uri)) || [];
  } catch (e: any) {
    console.error(e);
    throw new Error(
      `Error fetching states of ${entityIds.join(", ")}: ${JSON.stringify(
        e.message || "",
      )}`,
    );
  }

  const statesByEntity = Object.fromEntries(
    entityIds.map((entityId) => [entityId, [] as CachedStateEntity[]]),
  );
  for (const list of lists) {
    const entityId = list.find(({ entity_id }) => entity_id)?.entity_id;
    if (entityId && entityId in statesByEntity) {
      statesByEntity[entityId] = mapStates(list);
    }
  }
  return statesByEntity;
}

async function fetchStates(
  hass: HomeAssistant,
  entity: EntityIdStateConfig | EntityIdAttrConfig,
  range: [Date, Date],
): Promise<CachedStateEntity[]> {
  const statesByEntity = await fetchStatesBatch(hass, [entity], range);
  return statesByEntity[entity.entity];
}
export default fetchStates;
