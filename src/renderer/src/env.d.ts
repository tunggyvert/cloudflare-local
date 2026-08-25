/// <reference types="vite/client" />
import type { CoreApi } from '../../preload/index'

declare global {
  interface Window { core: CoreApi }
}
export {}
