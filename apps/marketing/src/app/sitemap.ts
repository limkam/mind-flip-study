import { MetadataRoute } from 'next';
import { subjects } from '@/lib/subjects';

export default function sitemap(): MetadataRoute.Sitemap {
  const subjectUrls = subjects.map((s) => ({
    url: `https://mindflip.io/study/${s.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  return [
    {
      url: 'https://mindflip.io',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: 'https://mindflip.io/pricing',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: 'https://mindflip.io/privacy',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...subjectUrls,
  ];
}
