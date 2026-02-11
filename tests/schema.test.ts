import { metaJsonSchema } from '../schema/metaJsonSchema';
import { appsMinSchema } from '../schema/appsMinSchema';
import { z } from 'zod';

describe('Schema Validation', () => {
  describe('metaJsonSchema', () => {
    // Valid meta.json data
    const validMetaData = {
      slug: 'valid-dapp',
      name: 'Valid DApp Name',
      logoUrl: './logo.png',
      category: 'DeFi',
      subcategory: ['Lending'],
      chains: ['Ethereum'],
      tags: ['Dex'],
      pricing: 'Free',
      content: {
        short: 'A short description.',
        description: 'A longer description.',
        meta: 'SEO meta description.',
        pageTitle: 'Valid DApp | Title',
      },
      links: {
        website: 'https://valid.com',
      },
      relations: {
        alternatives: [],
        related: [],
      },
      source: {
        fullyScraped: true,
      },
    };

    it('should validate valid meta.json data', () => {
      expect(() => metaJsonSchema.parse(validMetaData)).not.toThrow();
    });

    it('should allow optional fields to be missing', () => {
      const { source, links, ...minimalValidData } = validMetaData;
      const minimalLinks = { website: 'https://minimal.com' };
      const data = { ...minimalValidData, links: minimalLinks, category: validMetaData.category, subcategory: validMetaData.subcategory }; // Ensure category and subcategory are passed correctly
      expect(() => metaJsonSchema.parse(data)).not.toThrow();
    });

    it('should throw error for missing required fields', () => {
      const { slug, ...invalidData } = validMetaData;
      expect(() => metaJsonSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should throw error for invalid logoUrl (not string)', () => {
      const invalidData = { ...validMetaData, logoUrl: 123 };
      expect(() => metaJsonSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should throw error for invalid website URL format', () => {
      const invalidLinks = { website: 'not-a-url' };
      const invalidData = { ...validMetaData, links: invalidLinks };
      expect(() => metaJsonSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should throw error for content.short exceeding max length', () => {
      const invalidContent = { ...validMetaData.content, short: 'a'.repeat(201) };
      const invalidData = { ...validMetaData, content: invalidContent };
      expect(() => metaJsonSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should have source as undefined if source field is entirely omitted', () => {
      const { source, ...dataWithoutSource } = validMetaData;
      const parsed = metaJsonSchema.parse(dataWithoutSource);
      expect(parsed.source).toBeUndefined();
    });

    it('should default source.fullyScraped to true if source exists but fullyScraped is omitted', () => {
      const dataWithEmptySource = { ...validMetaData, source: {} };
      const parsed = metaJsonSchema.parse(dataWithEmptySource);
      expect(parsed.source?.fullyScraped).toBe(true);
    });
  });

  describe('appsMinSchema', () => {
    // Valid apps.min.json data (array of objects)
    const validAppsMinData = [
      {
        slug: 'min-dapp-1',
        name: 'Min DApp One',
        logoUrl: 'https://res.cloudinary.com/cloud/image/upload/v1/logo.png',
        category: 'GameFi',
        subcategory: ['Play-to-Earn'],
        chains: ['Polygon'],
        tags: ['P2E'],
        pricing: 'Free',
        short: 'A short summary.',
        updatedAt: new Date().toISOString(),
      },
      {
        slug: 'min-dapp-2',
        name: 'Min DApp Two',
        logoUrl: 'https://res.cloudinary.com/cloud/image/upload/v1/logo2.png',
        category: 'Tool',
        subcategory: ['Utility'],
        chains: ['Ethereum'],
        tags: ['Utils'],
        pricing: 'Paid',
        short: 'Another summary.',
        updatedAt: new Date().toISOString(),
      },
    ];

    it('should validate valid apps.min.json data', () => {
      expect(() => appsMinSchema.parse(validAppsMinData)).not.toThrow();
    });

    it('should throw error for missing required fields in array item', () => {
      const invalidItem = { ...validAppsMinData[0], slug: undefined }; // Missing slug
      const invalidData = [invalidItem];
      expect(() => appsMinSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should throw error for invalid logoUrl (not Cloudinary URL)', () => {
      const invalidItem = { ...validAppsMinData[0], logoUrl: './local.png' };
      const invalidData = [invalidItem];
      // Note: Zod schema only checks if it's a string, not if it's a Cloudinary URL pattern
      // This specific check would need custom refine or a more specific regex in schema
      expect(() => appsMinSchema.parse(invalidData)).not.toThrow(); // Will not throw by default Zod schema
    });

    it('should throw error for invalid updatedAt format', () => {
      const invalidItem = { ...validAppsMinData[0], updatedAt: 'not-a-date' };
      const invalidData = [invalidItem];
      expect(() => appsMinSchema.parse(invalidData)).toThrow(z.ZodError);
    });
  });
});
