import type { DomainEvent, DomainEventName } from "@sonelle/domain";

export interface EventStore {
  append<TName extends DomainEventName, TPayload>(
    event: DomainEvent<TName, TPayload>
  ): Promise<void>;
}
