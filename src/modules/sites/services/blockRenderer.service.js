/**
 * Block Renderer Service
 * Renders blocks to HTML for preview and public site rendering
 */

class BlockRendererService {
  /**
   * Render a single block to HTML
   */
  static renderBlock(block, colors = {}, fonts = {}) {
    if (!block || !block.type) {
      return '';
    }

    const data = block.data || {};
    const styles = block.styles || {};
    const settings = block.settings || {};

    // Generate inline styles from block styles
    const inlineStyles = this.generateInlineStyles(styles);

    switch (block.type) {
      case 'hero':
        return this.renderHeroBlock(data, styles, colors, fonts, inlineStyles);
      
      case 'text':
        return this.renderTextBlock(data, styles, inlineStyles);
      
      case 'image':
        return this.renderImageBlock(data, styles, inlineStyles);
      
      case 'gallery':
        return this.renderGalleryBlock(data, styles, inlineStyles);
      
      case 'features':
        return this.renderFeaturesBlock(data, styles, colors, fonts, inlineStyles);
      
      case 'testimonials':
        return this.renderTestimonialsBlock(data, styles, colors, fonts, inlineStyles);
      
      case 'cta':
        return this.renderCTABlock(data, styles, colors, fonts, inlineStyles);
      
      case 'form':
        return this.renderFormBlock(data, styles, colors, fonts, inlineStyles);
      
      case 'video':
        return this.renderVideoBlock(data, styles, inlineStyles);
      
      case 'code':
        return this.renderCodeBlock(data, styles, inlineStyles);
      
      case 'spacer':
        return this.renderSpacerBlock(data, inlineStyles);
      
      case 'divider':
        return this.renderDividerBlock(data, styles, inlineStyles);
      
      default:
        return `<div class="block block-${block.type}" style="${inlineStyles}">Unknown block type: ${block.type}</div>`;
    }
  }

  /**
   * Render multiple blocks
   */
  static renderBlocks(blocks, colors = {}, fonts = {}) {
    if (!blocks || !Array.isArray(blocks)) {
      return '';
    }

    // Sort blocks by order
    const sortedBlocks = [...blocks].sort((a, b) => (a.order || 0) - (b.order || 0));

    return sortedBlocks.map(block => this.renderBlock(block, colors, fonts)).join('\n');
  }

  /**
   * Render layout regions with blocks
   */
  static renderRegions(regions, colors = {}, fonts = {}) {
    if (!regions || !Array.isArray(regions)) {
      return '';
    }

    // Sort regions by responsive order (desktop)
    const sortedRegions = [...regions].sort((a, b) => {
      const aOrder = a.responsive?.desktop?.order ?? 0;
      const bOrder = b.responsive?.desktop?.order ?? 0;
      return aOrder - bOrder;
    });

    return sortedRegions.map(region => {
      const regionStyles = this.generateInlineStyles(region.styles || {});
      const regionClasses = this.generateRegionClasses(region);
      const blocksHTML = this.renderBlocks(region.blocks || [], colors, fonts);

      return `
        <section 
          id="region-${region.id}" 
          class="layout-region ${regionClasses}"
          style="${regionStyles}"
        >
          ${blocksHTML}
        </section>
      `;
    }).join('\n');
  }

  /**
   * Generate responsive classes for regions
   */
  static generateRegionClasses(region) {
    const classes = [];
    const responsive = region.responsive || {};

    if (responsive.mobile?.visible === false) {
      classes.push('hidden', 'sm:block');
    }
    if (responsive.tablet?.visible === false) {
      classes.push('hidden', 'md:block');
    }
    if (responsive.desktop?.visible === false) {
      classes.push('hidden', 'lg:block');
    }

    return classes.join(' ');
  }

  /**
   * Generate inline styles from style object
   */
  static generateInlineStyles(styles) {
    if (!styles || typeof styles !== 'object') {
      return '';
    }

    const stylePairs = Object.entries(styles)
      .filter(([_, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => {
        // Convert camelCase to kebab-case
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${cssKey}: ${value}`;
      });

    return stylePairs.join('; ');
  }

  /**
   * Render Hero Block
   */
  static renderHeroBlock(data, styles, colors, fonts, inlineStyles) {
    const title = data.title || '';
    const subtitle = data.subtitle || '';
    const description = data.description || '';
    const image = data.image || '';
    const ctaText = data.ctaText || '';
    const ctaLink = data.ctaLink || '#';
    const ctaSecondaryText = data.ctaSecondaryText || '';
    const ctaSecondaryLink = data.ctaSecondaryLink || '#';

    return `
      <section class="hero-block" style="${inlineStyles}">
        <div class="max-w-4xl mx-auto">
          ${title ? `<h1 class="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">${this.escapeHtml(title)}</h1>` : ''}
          ${subtitle ? `<h2 class="text-xl md:text-2xl lg:text-3xl font-semibold mb-4 text-gray-700">${this.escapeHtml(subtitle)}</h2>` : ''}
          ${description ? `<p class="text-lg mb-8 text-gray-600 max-w-2xl mx-auto">${this.escapeHtml(description)}</p>` : ''}
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            ${ctaText ? `<a href="${this.escapeHtml(ctaLink)}" class="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:opacity-90 transition-opacity">${this.escapeHtml(ctaText)}</a>` : ''}
            ${ctaSecondaryText ? `<a href="${this.escapeHtml(ctaSecondaryLink)}" class="inline-block px-6 py-3 border-2 border-primary text-primary rounded-lg font-semibold hover:bg-primary hover:text-white transition-colors">${this.escapeHtml(ctaSecondaryText)}</a>` : ''}
          </div>
          ${image ? `<div class="mt-8"><img src="${this.escapeHtml(image)}" alt="${this.escapeHtml(title)}" class="w-full h-auto rounded-lg" /></div>` : ''}
        </div>
      </section>
    `;
  }

  /**
   * Render Text Block
   */
  static renderTextBlock(data, styles, inlineStyles) {
    const content = data.content || '<p>Your text content here</p>';
    return `
      <section class="text-block prose prose-lg max-w-none" style="${inlineStyles}">
        ${content}
      </section>
    `;
  }

  /**
   * Render Image Block
   */
  static renderImageBlock(data, styles, inlineStyles) {
    const imageUrl = data.imageUrl || '';
    const alt = data.alt || '';
    const caption = data.caption || '';
    const link = data.link || '';

    if (!imageUrl) {
      return `<section class="image-block" style="${inlineStyles}"><div class="p-8 text-center text-gray-400 border-2 border-dashed rounded-lg">No image selected</div></section>`;
    }

    const imageTag = `<img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(alt)}" class="w-full h-auto" style="max-width: ${styles.maxWidth || '100%'}; border-radius: ${styles.borderRadius || '0'};" />`;
    const wrappedImage = link ? `<a href="${this.escapeHtml(link)}" class="block">${imageTag}</a>` : imageTag;

    return `
      <section class="image-block" style="${inlineStyles}">
        ${wrappedImage}
        ${caption ? `<p class="text-center text-sm text-gray-600 mt-2">${this.escapeHtml(caption)}</p>` : ''}
      </section>
    `;
  }

  /**
   * Render Gallery Block
   */
  static renderGalleryBlock(data, styles, inlineStyles) {
    const images = data.images || [];
    const columns = data.columns || 3;
    const spacing = data.spacing || '1rem';

    if (images.length === 0) {
      return `<section class="gallery-block" style="${inlineStyles}"><div class="p-8 text-center text-gray-400">No images in gallery</div></section>`;
    }

    const gridClass = `grid grid-cols-${columns} gap-${spacing}`;
    const imagesHTML = images.map(img => {
      const url = typeof img === 'string' ? img : (img.url || img.imageUrl || '');
      const alt = typeof img === 'string' ? '' : (img.alt || '');
      return `<img src="${this.escapeHtml(url)}" alt="${this.escapeHtml(alt)}" class="w-full h-auto rounded-lg" />`;
    }).join('');

    return `
      <section class="gallery-block" style="${inlineStyles}">
        <div class="${gridClass}">
          ${imagesHTML}
        </div>
      </section>
    `;
  }

  /**
   * Render Features Block
   */
  static renderFeaturesBlock(data, styles, colors, fonts, inlineStyles) {
    const title = data.title || '';
    const subtitle = data.subtitle || '';
    const items = data.items || [];

    return `
      <section class="features-block" style="${inlineStyles}">
        <div class="max-w-6xl mx-auto">
          ${title ? `<h2 class="text-3xl font-bold text-center mb-4">${this.escapeHtml(title)}</h2>` : ''}
          ${subtitle ? `<p class="text-center text-gray-600 mb-8">${this.escapeHtml(subtitle)}</p>` : ''}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${items.map(item => `
              <div class="feature-item text-center">
                ${item.icon ? `<div class="mb-4"><img src="${this.escapeHtml(item.icon)}" alt="${this.escapeHtml(item.title)}" class="w-16 h-16 mx-auto" /></div>` : ''}
                <h3 class="text-xl font-semibold mb-2">${this.escapeHtml(item.title || '')}</h3>
                <p class="text-gray-600">${this.escapeHtml(item.description || '')}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Render Testimonials Block
   */
  static renderTestimonialsBlock(data, styles, colors, fonts, inlineStyles) {
    const title = data.title || '';
    const testimonials = data.testimonials || [];

    return `
      <section class="testimonials-block" style="${inlineStyles}">
        <div class="max-w-6xl mx-auto">
          ${title ? `<h2 class="text-3xl font-bold text-center mb-8">${this.escapeHtml(title)}</h2>` : ''}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${testimonials.map(testimonial => `
              <div class="testimonial-item bg-white p-6 rounded-lg shadow-sm">
                <p class="text-gray-700 mb-4">"${this.escapeHtml(testimonial.content || '')}"</p>
                <div class="flex items-center">
                  ${testimonial.avatar ? `<img src="${this.escapeHtml(testimonial.avatar)}" alt="${this.escapeHtml(testimonial.name)}" class="w-12 h-12 rounded-full mr-4" />` : ''}
                  <div>
                    <div class="font-semibold">${this.escapeHtml(testimonial.name || '')}</div>
                    <div class="text-sm text-gray-500">${this.escapeHtml(testimonial.role || '')}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Render CTA Block
   */
  static renderCTABlock(data, styles, colors, fonts, inlineStyles) {
    const title = data.title || '';
    const description = data.description || '';
    const primaryButtonText = data.primaryButtonText || '';
    const primaryButtonLink = data.primaryButtonLink || '#';
    const secondaryButtonText = data.secondaryButtonText || '';
    const secondaryButtonLink = data.secondaryButtonLink || '#';

    return `
      <section class="cta-block" style="${inlineStyles}">
        <div class="max-w-4xl mx-auto text-center">
          ${title ? `<h2 class="text-3xl font-bold mb-4">${this.escapeHtml(title)}</h2>` : ''}
          ${description ? `<p class="text-lg mb-8">${this.escapeHtml(description)}</p>` : ''}
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            ${primaryButtonText ? `<a href="${this.escapeHtml(primaryButtonLink)}" class="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:opacity-90 transition-opacity">${this.escapeHtml(primaryButtonText)}</a>` : ''}
            ${secondaryButtonText ? `<a href="${this.escapeHtml(secondaryButtonLink)}" class="inline-block px-6 py-3 border-2 border-white text-white rounded-lg font-semibold hover:bg-white hover:text-primary transition-colors">${this.escapeHtml(secondaryButtonText)}</a>` : ''}
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Render Form Block
   */
  static renderFormBlock(data, styles, colors, fonts, inlineStyles) {
    const title = data.title || '';
    const fields = data.fields || [];
    const submitText = data.submitText || 'Submit';

    return `
      <section class="form-block" style="${inlineStyles}">
        <div class="max-w-2xl mx-auto">
          ${title ? `<h2 class="text-2xl font-bold mb-6">${this.escapeHtml(title)}</h2>` : ''}
          <form class="space-y-4">
            ${fields.map(field => {
              const fieldId = `field-${Math.random().toString(36).substr(2, 9)}`;
              const required = field.required ? 'required' : '';
              
              if (field.type === 'textarea') {
                return `
                  <div>
                    <label for="${fieldId}" class="block text-sm font-medium mb-1">${this.escapeHtml(field.label || '')}</label>
                    <textarea id="${fieldId}" name="${field.name || field.label}" ${required} class="w-full px-4 py-2 border rounded-lg"></textarea>
                  </div>
                `;
              }
              
              return `
                <div>
                  <label for="${fieldId}" class="block text-sm font-medium mb-1">${this.escapeHtml(field.label || '')}</label>
                  <input type="${field.type || 'text'}" id="${fieldId}" name="${field.name || field.label}" ${required} class="w-full px-4 py-2 border rounded-lg" />
                </div>
              `;
            }).join('')}
            <button type="submit" class="w-full px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:opacity-90 transition-opacity">
              ${this.escapeHtml(submitText)}
            </button>
          </form>
        </div>
      </section>
    `;
  }

  /**
   * Render Video Block
   */
  static renderVideoBlock(data, styles, inlineStyles) {
    const videoUrl = data.videoUrl || '';
    const videoType = data.videoType || 'youtube';
    const caption = data.caption || '';

    if (!videoUrl) {
      return `<section class="video-block" style="${inlineStyles}"><div class="p-8 text-center text-gray-400">No video URL provided</div></section>`;
    }

    let videoHTML = '';
    if (videoType === 'youtube') {
      const videoId = this.extractYouTubeId(videoUrl);
      videoHTML = `<iframe width="100%" height="400" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else if (videoType === 'vimeo') {
      const videoId = this.extractVimeoId(videoUrl);
      videoHTML = `<iframe width="100%" height="400" src="https://player.vimeo.com/video/${videoId}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    } else {
      videoHTML = `<video width="100%" controls><source src="${this.escapeHtml(videoUrl)}" type="video/mp4">Your browser does not support the video tag.</video>`;
    }

    return `
      <section class="video-block" style="${inlineStyles}">
        <div class="max-w-4xl mx-auto">
          ${videoHTML}
          ${caption ? `<p class="text-center text-sm text-gray-600 mt-2">${this.escapeHtml(caption)}</p>` : ''}
        </div>
      </section>
    `;
  }

  /**
   * Render Code Block
   */
  static renderCodeBlock(data, styles, inlineStyles) {
    const code = data.code || '';
    const language = data.language || 'html';

    return `
      <section class="code-block" style="${inlineStyles}">
        <pre class="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto"><code>${this.escapeHtml(code)}</code></pre>
      </section>
    `;
  }

  /**
   * Render Spacer Block
   */
  static renderSpacerBlock(data, inlineStyles) {
    const height = data.height || '4rem';
    return `<div class="spacer-block" style="height: ${height}; ${inlineStyles}"></div>`;
  }

  /**
   * Render Divider Block
   */
  static renderDividerBlock(data, styles, inlineStyles) {
    const style = data.style || 'solid';
    const color = data.color || '#e5e7eb';
    const width = data.width || '100%';
    const thickness = data.thickness || '1px';

    return `<hr class="divider-block" style="border-style: ${style}; border-color: ${color}; width: ${width}; border-width: 0 0 ${thickness} 0; ${inlineStyles}" />`;
  }

  /**
   * Extract YouTube video ID from URL
   */
  static extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  /**
   * Extract Vimeo video ID from URL
   */
  static extractVimeoId(url) {
    const regExp = /(?:vimeo)\.com.*(?:videos|video|channels|)\/([\d]+)/i;
    const match = url.match(regExp);
    return match ? match[1] : null;
  }

  /**
   * Escape HTML to prevent XSS
   */
  static escapeHtml(text) {
    if (typeof text !== 'string') {
      return '';
    }
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

module.exports = BlockRendererService;


