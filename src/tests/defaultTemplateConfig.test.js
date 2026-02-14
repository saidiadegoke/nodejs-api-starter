/**
 * Unit tests for default template config: default blocks, default page structure,
 * hero subdued config, and merge enrichment (templateId/componentName + hero data).
 */

const {
  getDefaultBlocks,
  getDefaultPageStructure,
  getDefaultBlocksForPage,
  mergeWithDefaults,
} = require('../utils/defaultTemplateConfig');

describe('Default Template Config', () => {
  describe('getDefaultBlocks', () => {
    test('returns blocks with templateId and componentName for builder UI', () => {
      const blocks = getDefaultBlocks();
      expect(blocks.length).toBeGreaterThan(0);

      const withTemplate = blocks.filter((b) => b.templateId);
      const withComponentName = blocks.filter((b) => b.componentName);
      expect(withTemplate.length).toBe(blocks.length);
      expect(withComponentName.length).toBe(blocks.length);

      const heroBlock = blocks.find((b) => b.id === 'block-about-hero');
      expect(heroBlock).toBeDefined();
      expect(heroBlock.templateId).toBe('hero-section-1');
      expect(heroBlock.componentName).toBe('About Hero');

      const servicesList = blocks.find((b) => b.id === 'block-services-list');
      expect(servicesList).toBeDefined();
      expect(servicesList.templateId).toBe('services-list-section-1');
      expect(servicesList.componentName).toBe('Services List');
    });

    test('about/contact/services hero blocks have subdued config in data', () => {
      const blocks = getDefaultBlocks();
      const subduedIds = ['block-about-hero', 'block-contact-hero', 'block-services-hero'];
      subduedIds.forEach((id) => {
        const b = blocks.find((bl) => bl.id === id);
        expect(b).toBeDefined();
        expect(b.data).toBeDefined();
        expect(b.data.showPrimaryButton).toBe(false);
        expect(b.data.showSecondaryButton).toBe(false);
        expect(b.data.showStats).toBe(false);
        expect(b.data.headlineSize).toBe('medium');
      });
    });

    test('home hero does not have subdued config (full hero)', () => {
      const blocks = getDefaultBlocks();
      const homeHero = blocks.find((b) => b.id === 'block-home-hero');
      expect(homeHero).toBeDefined();
      expect(homeHero.data?.showPrimaryButton).not.toBe(false);
      expect(homeHero.data?.headlineSize).not.toBe('medium');
    });
  });

  describe('getDefaultPageStructure / getDefaultBlocksForPage', () => {
    test('getDefaultPageStructure returns page with regions for each page type', () => {
      ['home', 'about', 'contact', 'services', 'store'].forEach((pageType) => {
        const page = getDefaultPageStructure(pageType);
        expect(page).toBeDefined();
        expect(page.slug).toBe(pageType);
        expect(page.regions).toBeDefined();
        expect(Array.isArray(page.regions)).toBe(true);
      });
    });

    test('getDefaultBlocksForPage(about) includes about hero with subdued data', () => {
      const blocks = getDefaultBlocksForPage('about');
      const hero = blocks.find((b) => b.id === 'block-about-hero');
      expect(hero).toBeDefined();
      expect(hero.data?.showPrimaryButton).toBe(false);
      expect(hero.data?.showStats).toBe(false);
      expect(hero.data?.headlineSize).toBe('medium');
      expect(hero.templateId).toBe('hero-section-1');
      expect(hero.componentName).toBe('About Hero');
    });

    test('getDefaultBlocksForPage(store) does not include a hero block', () => {
      const blocks = getDefaultBlocksForPage('store');
      const hero = blocks.find((b) => b.componentId === 'hero' || b.id?.includes('hero'));
      expect(hero).toBeUndefined();
    });
  });

  describe('mergeWithDefaults', () => {
    test('enriches existing blocks with templateId and componentName when missing', () => {
      const config = {
        pages: [{ slug: 'about', title: 'About', regions: [{ regionId: 'main', blockIds: ['block-about-hero'] }] }],
        blocks: [
          {
            id: 'block-about-hero',
            name: 'About Hero',
            componentId: 'hero',
            data: { headline: 'Custom Headline' },
          },
        ],
        theme: { colors: {}, fonts: {} },
      };
      const merged = mergeWithDefaults(config);
      const aboutHero = merged.blocks.find((b) => b.id === 'block-about-hero');
      expect(aboutHero).toBeDefined();
      expect(aboutHero.templateId).toBe('hero-section-1');
      expect(aboutHero.componentName).toBe('About Hero');
    });

    test('adds subdued hero data to existing about/contact/services hero blocks when missing', () => {
      const config = {
        pages: [{ slug: 'about', title: 'About', regions: [{ regionId: 'main', blockIds: ['block-about-hero'] }] }],
        blocks: [
          {
            id: 'block-about-hero',
            name: 'About Hero',
            componentId: 'hero',
            data: { headline: 'About Us' },
          },
        ],
        theme: { colors: {}, fonts: {} },
      };
      const merged = mergeWithDefaults(config);
      const aboutHero = merged.blocks.find((b) => b.id === 'block-about-hero');
      expect(aboutHero.data.showPrimaryButton).toBe(false);
      expect(aboutHero.data.showSecondaryButton).toBe(false);
      expect(aboutHero.data.showStats).toBe(false);
      expect(aboutHero.data.headlineSize).toBe('medium');
      expect(aboutHero.data.headline).toBe('About Us');
    });

    test('does not overwrite existing templateId or componentName', () => {
      const config = {
        pages: [{ slug: 'about', title: 'About', regions: [] }],
        blocks: [
          {
            id: 'block-about-hero',
            componentId: 'hero',
            templateId: 'custom-hero',
            componentName: 'My About Hero',
            data: {},
          },
        ],
        theme: { colors: {}, fonts: {} },
      };
      const merged = mergeWithDefaults(config);
      const aboutHero = merged.blocks.find((b) => b.id === 'block-about-hero');
      expect(aboutHero.templateId).toBe('custom-hero');
      expect(aboutHero.componentName).toBe('My About Hero');
    });
  });
});
