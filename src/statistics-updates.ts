import type { HomeAssistant } from "custom-card-helpers";
import type { StatisticPeriod } from "./recorder-types";
import type { StatisticsUpdatePeriod } from "./cache/statistics-refresh";

type Connection = Pick<HomeAssistant["connection"], "subscribeEvents">;
type Subscription = { active: boolean; unsubscribe?: () => void };

export class StatisticsUpdates {
  private connection?: Connection;
  private subscriptions = new Map<string, Subscription>();

  constructor(private onUpdate: (period: StatisticsUpdatePeriod) => void) {}

  update(
    connection: Connection | undefined,
    periods: ReadonlySet<StatisticPeriod>,
  ) {
    if (connection !== this.connection) this.disconnect();
    this.connection = connection;
    const events = new Set<string>();
    if (connection) {
      if (periods.has("5minute"))
        events.add("recorder_5min_statistics_generated");
      if ([...periods].some((period) => period !== "5minute")) {
        events.add("recorder_hourly_statistics_generated");
      }
    }
    for (const [event, subscription] of this.subscriptions) {
      if (!events.has(event)) {
        subscription.active = false;
        subscription.unsubscribe?.();
        this.subscriptions.delete(event);
      }
    }
    for (const event of events) {
      if (this.subscriptions.has(event)) continue;
      const subscription: Subscription = { active: true };
      this.subscriptions.set(event, subscription);
      connection!
        .subscribeEvents(() => {
          if (subscription.active)
            this.onUpdate(
              event === "recorder_5min_statistics_generated"
                ? "5minute"
                : "hour",
            );
        }, event)
        .then((unsubscribe) => {
          if (subscription.active) subscription.unsubscribe = unsubscribe;
          else unsubscribe();
        })
        .catch((error) => {
          if (!subscription.active) return;
          subscription.active = false;
          if (this.subscriptions.get(event) === subscription)
            this.subscriptions.delete(event);
          console.warn(
            "Plotly Graph Card: Could not subscribe to statistics updates",
            error,
          );
        });
    }
  }

  disconnect() {
    for (const subscription of this.subscriptions.values()) {
      subscription.active = false;
      subscription.unsubscribe?.();
    }
    this.subscriptions.clear();
    this.connection = undefined;
  }
}
