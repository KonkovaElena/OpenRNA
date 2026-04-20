export interface EventStoreAppendInput {
  aggregateId: string;
}

export interface EventStoreAppendRecord extends EventStoreAppendInput {
  version: number;
}

export interface IEventStore<
  TEventInput extends EventStoreAppendInput,
  TEventRecord extends EventStoreAppendRecord = TEventInput & EventStoreAppendRecord,
> {
  append(
    aggregateId: string,
    expectedVersion: number,
    events: readonly TEventInput[],
  ): Promise<ReadonlyArray<TEventRecord>>;

  listByAggregateId(aggregateId: string): Promise<ReadonlyArray<TEventRecord>>;

  getLatestVersion(aggregateId: string): Promise<number>;
}