import type { MarketTor, SavedTor } from '@/types/tor';

// Government bookmarks use the e-GP project number, never the MongoDB document ID.
export function torBookmarkKey(tor: Pick<MarketTor, 'source' | 'projectId'> & { id?: string; torId?: string }) {
    const id = tor.source === 'government' ? tor.projectId : tor.torId || tor.id;
    return id ? `${tor.source}:${id}` : '';
}
export function savedTorToMarketTor(tor: SavedTor): MarketTor {
    return {
        ...tor,
        id: tor.source === 'government' ? tor.projectId || '' : tor.torId || '',
    };
}
