import type {
  Change, IaCFragment, ApplyResult, ProviderId, Resource,
} from '../../shared/model'

export interface Provider {
  readonly id: ProviderId
  readonly label: string

  /** True when this provider is configured and reachable right now. */
  available(): Promise<{ ok: boolean; detail?: string }>

  /** Read live state. Must be side-effect free. */
  discover(): Promise<Resource[]>

  /** Diff desired against live. Must be side-effect free. */
  plan(desired: unknown, live: Resource[]): Promise<Change[]>

  /** The only write path. Callers must have shown the change to a human first. */
  apply(change: Change): Promise<ApplyResult>

  /** Render a change as IaC instead of applying it. */
  export(change: Change, format: IaCFragment['format']): IaCFragment
}
