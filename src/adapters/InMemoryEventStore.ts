import { ApiError } from "../errors.js";
import type { IEventStore } from "../ports/IEventStore.js";

type AppendableEvent = { aggregateId: string };
type StoredEvent<TEventInput extends AppendableEvent> = TEventInput & { version: number };

export class InMemoryEventStore<TEventInput extends AppendableEvent>
  implements IEventStore<TEventInput, StoredEvent<TEventInput>> {
  private readonly eventsByAggregateId = new Map<string, StoredEvent<TEventInput>[]>();

  async append(
    aggregateId: string,
    expectedVersion: number,
    events: readonly TEventInput[],
  ): Promise<ReadonlyArray<StoredEvent<TEventInput>>> {
    const existing = this.eventsByAggregateId.get(aggregateId) ?? [];
    const currentVersion = existing.at(-1)?.version ?? 0;

    if (currentVersion !== expectedVersion) {
      throw new ApiError(
        409,
        "event_version_conflict",
        `Expected version ${expectedVersion} but found ${currentVersion} for aggregate ${aggregateId}.`,
        "Reload the latest aggregate journal before appending new events.",
      );
    }

    const appended = events.map((event, index) => {
      if (event.aggregateId !== aggregateId) {
        throw new ApiError(
          409,
          "event_aggregate_mismatch",
          "Event aggregateId does not match the requested append aggregateId.",
          "Append only events that belong to the target aggregate.",
        );
      }

      return {
        ...structuredClone(event),
        version: currentVersion + index + 1,
      } satisfies StoredEvent<TEventInput>;
    });

    this.eventsByAggregateId.set(aggregateId, [...existing, ...appended.map((event) => structuredClone(event))]);
    return structuredClone(appended);
  }

  async listByAggregateId(aggregateId: string): Promise<ReadonlyArray<StoredEvent<TEventInput>>> {
    return structuredClone(this.eventsByAggregateId.get(aggregateId) ?? []);
  }

  async getLatestVersion(aggregateId: string): Promise<number> {
    return this.eventsByAggregateId.get(aggregateId)?.at(-1)?.version ?? 0;
  }
}