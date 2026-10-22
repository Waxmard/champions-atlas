import catalog from './data/catalog.json' with { type: 'json' };
import type { Team } from './catalog.ts';

export default catalog as Omit<typeof catalog, 'teams'> & { teams: Team[] };
