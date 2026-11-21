type Listener = () => void;

const listeners = new Set<Listener>();
let transactionRevision = 0;

export function emitTransactionCreated(): void {
  transactionRevision += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function emitTransactionUpdated(): void {
  emitTransactionCreated();
}

export function emitTransactionDeleted(): void {
  emitTransactionCreated();
}

export function emitTransactionChanged(): void {
  emitTransactionCreated();
}

export function subscribeTransactionCreated(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTransactionRevision(): number {
  return transactionRevision;
}
