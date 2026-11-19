import {
  collection,
  doc,
  getDocsFromServer,
  query,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

export async function deleteUserData(
  firestore: Firestore,
  id: string
): Promise<void> {
  const parent = doc(firestore, 'users', id);
  const [teams, sets, tokens] = await Promise.all([
    getDocsFromServer(collection(parent, 'teams')),
    getDocsFromServer(collection(parent, 'pokemonSets')),
    getDocsFromServer(
      query(collection(firestore, 'pushTokens'), where('uid', '==', id))
    ),
  ]);
  const refs = [
    ...[teams, sets, tokens].flatMap(({ docs }) => docs.map(({ ref }) => ref)),
    doc(parent, 'pokemonSetState', 'manifest'),
    doc(parent, 'catalogState', 'regulations'),
    parent,
  ];
  const batchSize = 500;
  for (let start = 0; start < refs.length; start += batchSize) {
    const batch = writeBatch(firestore);
    for (const ref of refs.slice(start, start + batchSize)) batch.delete(ref);
    await batch.commit();
  }
}
