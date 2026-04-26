const pool = require('../../../db/pool');
const PostModel = require('../models/post.model');

function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function baseUrl() {
  const u = (process.env.API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
  return u;
}

class PostSeoFeedService {
  static async buildSeoPayload(postId, viewerUserId, viewerIsAdmin) {
    const PostService = require('./post.service');
    const post = await PostService.getVisible(postId, viewerUserId, viewerIsAdmin);
    if (!post) return null;

    let ogImageUrl = null;
    if (post.og_image_file_id) {
      const r = await pool.query(
        'SELECT file_url FROM files WHERE id = $1 AND deleted_at IS NULL',
        [post.og_image_file_id]
      );
      ogImageUrl = r.rows[0]?.file_url || null;
    }

    const url = `${baseUrl()}/posts/${post.id}`;
    const title = post.seo_title || post.title;
    const description = post.seo_description || post.excerpt || '';

    return {
      post_id: post.id,
      slug: post.slug,
      url,
      canonical_url: post.canonical_url || url,
      title,
      description,
      robots: post.robots_directive || 'index,follow',
      open_graph: {
        title,
        description,
        type: 'article',
        url,
        image: ogImageUrl,
      },
      twitter: {
        card: post.twitter_card || 'summary',
        title,
        description,
        image: ogImageUrl,
      },
    };
  }

  static async rssXml(limit = 40) {
    const rows = await PostModel.listRecentPublishedForFeed(limit);
    const b = baseUrl();
    const items = rows
      .map((p) => {
        const link = `${b}/posts/${p.id}`;
        const pub = (p.published_at || p.updated_at || new Date()).toUTCString();
        return `<item><title>${xmlEscape(p.title)}</title><link>${xmlEscape(link)}</link><guid>${xmlEscape(
          link
        )}</guid><pubDate>${pub}</pubDate><description>${xmlEscape(
          (p.excerpt || '').slice(0, 5000)
        )}</description></item>`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${xmlEscape(process.env.APP_NAME || 'Posts')}</title>
<link>${xmlEscape(b)}</link>
<description>Published posts</description>
${items}
</channel>
</rss>`;
  }

  static async sitemapXml(limit = 500) {
    const rows = await PostModel.listRecentPublishedForSitemap(limit);
    const b = baseUrl();
    const urls = rows
      .map((p) => {
        const loc = `${b}/posts/${p.id}`;
        const lastmod = (p.updated_at || new Date()).toISOString().slice(0, 10);
        return `<url><loc>${xmlEscape(loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq></url>`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  }
}

module.exports = PostSeoFeedService;
