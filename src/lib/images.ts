import portfolio from '../data/portfolio.json';
import site from '../data/site-images.json';
import credits from '../data/credits.json';
import captions from '../data/captions.json';

export interface ImgInfo {
  ref: string; kind: 'portfolio' | 'site'; id: string;
  width: number; height: number; alt: string;
  photographer: string; photographerUrl?: string; photoUrl?: string;
  title?: string; category?: string;
  src: (w: 480 | 800 | 1200 | 1800) => string;
  webp: (w: 480 | 800 | 1200 | 1800) => string;
}

const creditFor = (key: string) => (credits as any[]).find((c) => c.image === key);

/** ref = "portfolio/weddings-01" or "site/about-story" */
export function imgInfo(ref: string): ImgInfo {
  const [kind, id] = ref.split('/') as ['portfolio' | 'site', string];
  if (kind === 'site') {
    const r = (site as any)[id];
    if (!r) throw new Error(`Unknown site image: ${ref}`);
    const c = creditFor(`site/${id}.jpg`);
    return { ref, kind, id, width: r.width, height: r.height, alt: r.alt, photographer: r.photographer, photographerUrl: c?.photographerUrl, photoUrl: c?.photoUrl, src: (w) => `/photos/site/${id}-${w}.jpg`, webp: (w) => `/photos/site/${id}-${w}.webp` };
  }
  const r = (portfolio as any[]).find((p) => p.id === id);
  if (!r) throw new Error(`Unknown portfolio image: ${ref}`);
  const c = creditFor(`portfolio/${r.category}/${id}.jpg`);
  return { ref, kind, id, width: r.width, height: r.height, alt: r.alt, photographer: r.photographer, photographerUrl: c?.photographerUrl, photoUrl: c?.photoUrl, title: (captions as any)[id]?.title, category: r.category, src: (w) => `/photos/portfolio/${id}-${w}.jpg`, webp: (w) => `/photos/portfolio/${id}-${w}.webp` };
}

export const categoryLabel: Record<string, string> = { weddings: 'Weddings', portraits: 'Portraits', landscapes: 'Landscapes' };
