import type { HomeAssistant } from "custom-card-helpers";
import type { HistoryResponse } from "./cache/fetch-states";

type Connection = Pick<
  HomeAssistant["connection"],
  "subscribeMessage" | "addEventListener" | "removeEventListener"
>;
type Subscription = {
  active: boolean;
  unsubscribe?: () => Promise<void> | void;
};

export class HistoryUpdates {
  private connection?: Connection;
  private subscription?: Subscription;
  private ids: string[] = [];
  private key = "";
  private attributes = false;
  private getStart = () => Date.now();

  constructor(private onUpdate: (states: HistoryResponse) => void) {}

  has(entityId: string) {
    return !!this.subscription?.active && this.ids.includes(entityId);
  }

  update(
    connection: Connection | undefined,
    entityIds: string[],
    attributes: boolean,
    getStart: () => number,
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
    if (!this.subscription) this.subscribe();
  }

  private reconnect = () => {
    this.stopSubscription();
    this.subscribe();
  };

  private subscribe() {
    const subscription: Subscription = { active: true };
    this.subscription = subscription;
    // HA queues every live change and catches up after Recorder commits.
    // A fresh start on reconnect avoids replaying an ever-growing time range.
    this.connection!.subscribeMessage<{ states: HistoryResponse }>(
      (message) => {
        if (subscription.active && message.states)
          this.onUpdate(message.states);
      },
      {
        type: "history/stream",
        start_time: new Date(
          Math.min(Date.now(), this.getStart()) - 1,
        ).toISOString(),
        entity_ids: this.ids,
        include_start_time_state: false,
        significant_changes_only: false,
        minimal_response: !this.attributes,
        no_attributes: !this.attributes,
      },
      { resubscribe: false },
    )
      .then((unsubscribe) => {
        if (subscription.active) subscription.unsubscribe = unsubscribe;
        else this.unsubscribe(unsubscribe);
      })
      .catch((error) => {
        if (!subscription.active) return;
        subscription.active = false;
        if (this.subscription === subscription) this.subscription = undefined;
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

  private stopSubscription() {
    if (!this.subscription) return;
    this.subscription.active = false;
    if (this.subscription.unsubscribe)
      this.unsubscribe(this.subscription.unsubscribe);
    this.subscription = undefined;
  }

  disconnect() {
    this.stopSubscription();
    this.connection?.removeEventListener("ready", this.reconnect);
    this.connection = undefined;
    this.ids = [];
    this.key = "";
  }
}
