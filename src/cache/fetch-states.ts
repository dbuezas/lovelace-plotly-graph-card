import { HomeAssistant } from "custom-card-helpers";
import {
  EntityIdAttrConfig,
  EntityIdStateConfig,
  History,
  HistoryInRange,
  isEntityIdAttrConfig,
  isEntityIdStateConfig,
} from "../types";
import { sleep } from "../utils";

async function fetchStates(
  hass: HomeAssistant,
  entity: EntityIdStateConfig | EntityIdAttrConfig,
  [start, end]: [Date, Date],
  significant_changes_only?: boolean,
  minimal_response?: boolean
): Promise<HistoryInRange> {
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
    minimal_response_query +
    `end_time=${end.toISOString()}`;
  let list: History | undefined;
  try {
    const lists: History[] = (await hass.callApi("GET", uri)) || [];
    list = lists[0];
  } catch (e: any) {
    console.error(e);
    throw new Error(`Error fetching ${entity.entity}: ${e.msg}`);
  }
  if (!list) list = []; //throw new Error(`Error fetching ${entity.entity}`); // shutup typescript
  return {
    range: [+start, +end],
    history: list
      .map((entry) => ({
        ...entry,
        state: isEntityIdAttrConfig(entity)
          ? entry.attributes[entity.attribute]
          : entry.state,
        last_updated: +new Date(entry.last_updated || entry.last_changed),
      }))
      .filter(({ last_updated }) => last_updated),
  };
}
export default fetchStates;
