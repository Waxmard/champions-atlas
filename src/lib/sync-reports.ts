import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';

const retentionMs = 90 * 24 * 60 * 60 * 1000;

const text = (value: unknown, max: number) =>
  (typeof value === 'string' ? value : '').slice(0, max);

export async function uploadSyncFailures(
  firestore: Firestore,
  uid: string,
  entries: unknown[]
): Promise<void> {
  const reports = collection(firestore, 'syncFailures');
  const expireAt = Timestamp.fromMillis(Date.now() + retentionMs);
  await runTransaction(
    firestore,
    (transaction) => {
      for (const entry of entries) {
        const fields =
          entry && typeof entry === 'object'
            ? (entry as Record<string, unknown>)
            : {};
        transaction.set(doc(reports), {
          uid,
          createdAt: serverTimestamp(),
          expireAt,
          at: text(fields.at, 40),
          step: text(fields.step, 40),
          code: text(fields.code, 100),
          message: text(fields.message, 2000),
          cause: text(fields.cause, 2000),
          version: text(fields.version, 40),
          online: fields.online === true,
          visible: fields.visible === true,
        });
      }
      return Promise.resolve();
    },
    { maxAttempts: 1 }
  );
}
