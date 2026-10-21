// A Qloo entity in the slim shape Memory Lane uses. lib/qloo/client.ts turns Qloo's large
// responses into this, and the committed fixtures (fixtures/qloo/) are already in it, so tests
// and live runs see the same data.

export type QlooEntity = {
  entity_id: string;
  name: string;
  type?: string;
  properties: {
    release_year?: number;
    content_rating?: string;
    plot_themes_description?: string;
    description?: string;
    short_description?: string;
    primary_genre?: string; // e.g. "urn:tag:genre:place:heritage_building"
    specialty_dishes?: { id: string; name: string }[];
  };
  genres: string[]; // names of Qloo genre tags, e.g. "War", "Musical"
  keywords: string[]; // names of Qloo keyword tags, e.g. "Hospital"
};

export type Excluded = { title: string; reason: string };
