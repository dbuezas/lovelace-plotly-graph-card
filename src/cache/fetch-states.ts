import { HomeAssistant } from "custom-card-helpers";
import {
  CachedEntity,
  EntityIdAttrConfig,
  EntityIdStateConfig,
  HassEntity,
  isEntityIdAttrConfig,
} from "../types";

async function fetchStates(
  hass: HomeAssistant,
  entity: EntityIdStateConfig | EntityIdAttrConfig,
  [start, end]: [Date, Date],
  significant_changes_only?: boolean,
  minimal_response?: boolean
): Promise<CachedEntity[]> {
  const no_attributes_query = isEntityIdAttrConfig(entity)
    ? ""
    : "no_attributes&";
  const minimal_response_query =
    minimal_response && isEntityIdAttrConfig(entity) ? "" : "minimal_response&";
  const significant_changes_only_query =
    significant_changes_only && isEntityIdAttrConfig(entity) ? "0" : "1";
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
  return (list || [])
    .map((entry) => ({
      ...entry,
      timestamp: +new Date(entry.last_updated || entry.last_changed),
      value: null, // may be state or an attribute. Will be set when getting the history
    }))
    .filter(({ timestamp }) => timestamp);
}
export default fetchStates;
