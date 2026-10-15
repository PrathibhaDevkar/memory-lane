// Media is linked out as a search, never embedded (docs/plan.md §4.1: no embeds, no lyrics).
// Built server-side from the title so the agent never writes URLs itself.

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function spotifySearchUrl(query: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}
