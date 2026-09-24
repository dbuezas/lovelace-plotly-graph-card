import { HomeAssistant } from "custom-card-helpers";
import {
  CachedStateEntity,
  EntityIdAttrConfig,
  EntityIdStateConfig,
  HassEntity,
  isEntityIdAttrConfig,
} from "../types";

type CompressedHistoryState = {
  s: string;
  a?: Record<string, unknown>;
  lc?: number;
  lu: number;
};

type HistoryState = HassEntity | CompressedHistoryState;
type HistoryResponse = Record<string, HistoryState[]>;

function expandState(entityId: string, state: HistoryState): HassEntity {
  if (!("s" in state)) return state;
  const lastUpdated = new Date(state.lu * 1000).toISOString();
  return {
    entity_id: entityId,
    state: state.s,
    attributes: state.a ?? {},
    last_changed: new Date((state.lc ?? state.lu) * 1000).toISOString(),
    last_updated: lastUpdated,
    context: { id: "", parent_id: null, user_id: null },
  };
}

function mapStates(
  entityId: string,
  list: HistoryState[] | undefined,
): CachedStateEntity[] {
  return (list || [])
    .map((historyState) => {
      const state = expandState(entityId, historyState);
      return {
        state,
        x: new Date(state.last_updated || state.last_changed),
        y: null, // may be state or an attribute. Will be set when getting the history
      };
    })
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
  let history: HistoryResponse;
  try {
    history =
      (await hass.callWS<HistoryResponse>({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: entityIds,
        include_start_time_state: true,
        significant_changes_only: false,
        minimal_response: !includeAttributes,
        no_attributes: !includeAttributes,
      })) || {};
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
  for (const entityId of entityIds) {
    statesByEntity[entityId] = mapStates(entityId, history[entityId]);
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
