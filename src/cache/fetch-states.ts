import { HomeAssistant } from "custom-card-helpers";
import {
  CachedStateEntity,
  EntityIdAttrConfig,
  EntityIdStateConfig,
  HassEntity,
  isEntityIdAttrConfig,
} from "../types";

async function fetchStates(
  hass: HomeAssistant,
  entity: EntityIdStateConfig | EntityIdAttrConfig,
  [start, end]: [Date, Date]
): Promise<CachedStateEntity[]> {
  const uri =
    `history/period/${start.toISOString()}?` +
    [
      `filter_entity_id=${entity.entity}`,
      `significant_changes_only=0`,
      isEntityIdAttrConfig(entity) ? "" : "no_attributes&",
      isEntityIdAttrConfig(entity) ? "" : "minimal_response&",
      `end_time=${end.toISOString()}`,
    ]
      .filter(Boolean)
      .join("&");
  let list: HassEntity[] | undefined;
  try {
    const lists: HassEntity[][] = (await hass.callApi("GET", uri)) || [];
    list = lists[0];
  } catch (e: any) {
    console.error(e);
    throw new Error(
      `Error fetching states of ${entity.entity}: ${JSON.stringify(
        e.message || ""
      )}`
    );
  }
  return (list || [])
    .map((state) => ({
      state,
      x: new Date(state.last_updated || state.last_changed),
      y: null, // may be state or an attribute. Will be set when getting the history
    }))
    .filter(({ x }) => x);
}
export default fetchStates;
