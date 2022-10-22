import { HomeAssistant } from "custom-card-helpers";
import { History } from "./types";
import { sleep } from "./utils";

async function fetchStates(
  hass: HomeAssistant,
  entityIdWithAttribute: string,
  entityId: string,
  [start, end]: [Date, Date],
  attribute?: string,
  significant_changes_only?: boolean,
  minimal_response?: boolean
) {
  const minimal_response_query =
    minimal_response && !attribute ? "minimal_response&" : "";
  const significant_changes_only_query =
    significant_changes_only && !attribute ? "1" : "0";
  const uri =
    `history/period/${start.toISOString()}?` +
    `filter_entity_id=${entityId}&` +
    `significant_changes_only=${significant_changes_only_query}&` +
    minimal_response_query +
    `end_time=${end.toISOString()}`;
  let list: History | undefined;
  let succeeded = false;
  let retries = 0;
  while (!succeeded) {
    try {
      const lists: History[] = (await hass.callApi("GET", uri)) || [];
      list = lists[0];
      succeeded = true;
    } catch (e) {
      console.error(e);
      retries++;
      if (retries > 50) return null;
      await sleep(100);
    }
  }
  if (!list || list.length == 0) return null;

  /*
home assistant will "invent" a datapoiont at startT with the previous known value, except if there is actually one at startT.
To avoid these duplicates, the "fetched range" is capped to end at the last known point instead of endT.
This ensures that the next fetch will start with a duplicate of the last known datapoint, which can then be removed.
On top of that, in order to ensure that the last known point is extended to endT, I duplicate the last datapoint
and set its date to endT.
*/
  const last = list[list.length - 1];
  const dup = JSON.parse(JSON.stringify(last));
  list[0].duplicate_datapoint = true;
  dup.duplicate_datapoint = true;
  dup.last_updated = Math.min(+end, Date.now());
  list.push(dup);
  return {
    entityId: entityIdWithAttribute,
    range: [+start, +new Date(dup.last_updated)], // cap range to now
    attributes: {
      unit_of_measurement: "",
      ...list[0].attributes,
    },
    history: list
      .map((entry) => ({
        ...entry,
        state: attribute ? entry.attributes[attribute] : entry.state,
        last_updated: +new Date(entry.last_updated || entry.last_changed),
      }))
      .filter(({ last_updated }) => last_updated),
  };
}
export default fetchStates;
