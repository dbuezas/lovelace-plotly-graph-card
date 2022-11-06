import { HomeAssistant } from "custom-card-helpers";
import {
  EntityIdAttrConfig,
  EntityIdStateConfig,
  EntityState,
  HassEntity,
  isEntityIdAttrConfig,
  isEntityIdStateConfig,
} from "../types";

async function fetchStates(
  hass: HomeAssistant,
  entity: EntityIdStateConfig | EntityIdAttrConfig,
  [start, end]: [Date, Date],
  significant_changes_only?: boolean,
  minimal_response?: boolean
): Promise<EntityState[]> {
  const no_attributes_query = isEntityIdStateConfig(entity)
    ? "no_attributes&"
    : "";
  const minimal_response_query =
    minimal_response && isEntityIdStateConfig(entity)
      ? "minimal_response&"
      : "";
  const significant_changes_only_query =
    significant_changes_only && isEntityIdStateConfig(entity) ? "1" : "0";
  const uri =
    `history/period/${start.toISOString()}?` +
    `filter_entity_id=${entity.entity}&` +
    `significant_changes_only=${significant_changes_only_query}&` +
    `${no_attributes_query}&` +
    minimal_response_query +
    `end_time=${end.toISOString()}`;
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
  if (!list) list = [];
  return list
    .map((entry) => ({
      ...entry,
      value: isEntityIdAttrConfig(entity)
        ? entry.attributes[entity.attribute] || null
        : entry.state,
      timestamp: +new Date(entry.last_updated || entry.last_changed),
    }))
    .filter(({ timestamp }) => timestamp);
}
export default fetchStates;
