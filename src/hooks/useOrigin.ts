'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/** Origine du site (https://…) côté navigateur, chaîne vide pendant le rendu serveur. */
export function useOrigin(): string {
  return useSyncExternalStore(subscribe, () => window.location.origin, () => '')
}
