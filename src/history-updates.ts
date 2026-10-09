import type { HomeAssistant } from "custom-card-helpers";
import type { HistoryResponse } from "./cache/fetch-states";

type Connection = Pick<
  HomeAssistant["connection"],
  "subscribeMessage" | "addEventListener" | "removeEventListener"
>;
type Subscription = {
  active: boolean;
  stale: boolean;
  ids: string[];
  unsubscribe?: () => Promise<void> | void;
};

export class HistoryUpdates {
  private connection?: Connection;
  private subscriptions: Subscription[] = [];
  private ids: string[] = [];
  private key = "";
  private attributes = false;
  private getStart = (_entityId: string) => Date.now();

  constructor(
    private onUpdate: (states: HistoryResponse, start: number) => void,
  ) {}

  has(entityId: string) {
    return this.subscriptions.some(
      (subscription) =>
        subscription.active && subscription.ids.includes(entityId),
    );
  }

  update(
    connection: Connection | undefined,
    entityIds: string[],
    attributes: boolean,
    getStart: (entityId: string) => number,
  ) {
    const ids = [...new Set(entityIds)].sort();
    const key = JSON.stringify([ids, attributes]);
    if (!connection?.subscribeMessage || ids.length === 0) {
      this.disconnect();
      return;
    }
    if (connection !== this.connection || key !== this.key) {
      this.disconnect();
      this.connection = connection;
      this.ids = ids;
      this.attributes = attributes;
      this.key = key;
      connection.addEventListener("ready", this.reconnect);
    }
    this.getStart = getStart;
    if (this.subscriptions.length === 0) this.subscribe();
  }

  private reconnect = () => {
    // The old socket already dropped these subscriptions. Calling their
    // unsubscribe functions on the new socket could cancel a reused ID.
    this.stopSubscriptions(true);
    this.subscribe();
  };

  private subscribe() {
    const groups = new Map<number, string[]>();
    const now = Date.now();
    for (const id of this.ids) {
      const start = Math.min(now, this.getStart(id));
      const ids = groups.get(start) ?? [];
      ids.push(id);
      groups.set(start, ids);
    }
    for (const [start, ids] of groups) this.subscribeGroup(start, ids);
  }

  private subscribeGroup(start: number, ids: string[]) {
    const subscription: Subscription = { active: true, stale: false, ids };
    this.subscriptions.push(subscription);
    // HA queues every live change and catches up after Recorder commits.
    // A fresh start on reconnect avoids replaying an ever-growing time range.
    this.connection!.subscribeMessage<{ states: HistoryResponse }>(
      (message) => {
        if (subscription.active && message.states)
          this.onUpdate(message.states, start);
      },
      {
        type: "history/stream",
        start_time: new Date(start - 1).toISOString(),
        entity_ids: ids,
        include_start_time_state: false,
        significant_changes_only: false,
        minimal_response: !this.attributes,
        no_attributes: !this.attributes,
      },
      { resubscribe: false },
    )
      .then((unsubscribe) => {
        if (subscription.active) subscription.unsubscribe = unsubscribe;
        else if (!subscription.stale) this.unsubscribe(unsubscribe);
      })
      .catch((error) => {
        if (!subscription.active) return;
        subscription.active = false;
        // Keep the failed attempt until ready or a configuration change;
        // unrelated hass updates must not repeatedly retry it.
        console.warn(
          "Plotly Graph Card: Could not subscribe to history updates",
          error,
        );
      });
  }

  private unsubscribe(unsubscribe: () => Promise<void> | void) {
    Promise.resolve(unsubscribe()).catch((error) => {
      console.warn(
        "Plotly Graph Card: Could not unsubscribe from history updates",
        error,
      );
    });
  }

  private stopSubscriptions(stale = false) {
    for (const subscription of this.subscriptions) {
      subscription.active = false;
      subscription.stale = stale;
      if (!stale && subscription.unsubscribe)
        this.unsubscribe(subscription.unsubscribe);
    }
    this.subscriptions = [];
  }

  disconnect() {
    this.stopSubscriptions();
    this.connection?.removeEventListener("ready", this.reconnect);
    this.connection = undefined;
    this.ids = [];
    this.key = "";
  }
}
