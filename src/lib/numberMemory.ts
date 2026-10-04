// Global in-memory cache for remembered numbers across component mount/unmount cycles
const numberMemoryStore = new Map<string, number>();

export function getRememberedNumber(key: string): number | undefined {
  return numberMemoryStore.get(key);
}

export function setRememberedNumber(key: string, val: number): void {
  numberMemoryStore.set(key, val);
}

export function clearNumberMemory(): void {
  numberMemoryStore.clear();
}
