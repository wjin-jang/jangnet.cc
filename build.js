const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

// ── Config ──────────────────────────────────────────────────────────
const VAULT = path.resolve(__dirname, '..', 'Vaults', 'Jangnet.cc');
const SITE  = __dirname;

const POSTS_SRC  = path.join(VAULT, 'posts');
const PAGES_SRC  = path.join(VAULT, 'pages');
const IMAGES_SRC = path.join(VAULT, 'images');
const POSTS_OUT  = path.join(SITE, 'posts');
const IMAGES_OUT = path.join(SITE, 'assets', 'images', 'posts');
const POSTS_JSON = path.join(SITE, 'assets', 'data', 'posts.json');

// ── Image handling ──────────────────────────────────────────────────

// Collect vault image paths found during rendering so we can copy them
const imagesToCopy = new Set();

/**
 * If href points to a vault-relative image (e.g. "images/foo.png"),
 * rewrite it to the site-absolute path and queue the file for copying.
 * Absolute paths (starting with /) are left untouched (existing images).
 */
function resolveImageHref(href) {
    if (href.startsWith('/') || href.startsWith('http')) return href;

    // Treat as vault-relative: "images/foo.png" or just "foo.png"
    const vaultPath = path.join(IMAGES_SRC, path.basename(href));
    if (fs.existsSync(vaultPath)) {
        imagesToCopy.add(path.basename(href));
    }
    return '/assets/images/posts/' + path.basename(href);
}

// ── Markdown renderer ──────────────────────────────────────────────

// Track image count per render for lazy loading
let imageIndex = 0;

const renderer = {
    // Custom heading: "## Title | Subtitle" → header-row div
    heading({ text, depth }) {
        const tag = `h${depth}`;
        if (text.includes(' | ')) {
            const parts = text.split(' | ');
            return `<div class="header-row"><${tag}>${parts[0]}</${tag}><${tag}>${parts[1]}</${tag}></div>\n`;
        }
        return `<${tag}>${text}</${tag}>\n`;
    },

    // Custom image: ![alt](src "caption") → figure with figcaption
    image({ href, title, text }) {
        const src = resolveImageHref(href);
        const lazy = imageIndex > 0 ? ' loading="lazy"' : '';
        imageIndex++;
        if (title) {
            return `<figure><img src="${src}" alt="${text}"${lazy}><figcaption>${title}</figcaption></figure>`;
        }
        return `<figure><img src="${src}" alt="${text}"${lazy}></figure>`;
    },

    // Unwrap paragraphs that contain only a figure
    paragraph({ tokens }) {
        const body = this.parser.parseInline(tokens);
        const trimmed = body.trim();
        if (trimmed.startsWith('<figure>')) return trimmed + '\n';
        return `<p>${body}</p>\n`;
    }
};

marked.use({ renderer, breaks: true });

// ── Templates ───────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(iso) {
    const d = iso.split('-');
    return MONTHS[parseInt(d[1], 10) - 1] + ' ' + parseInt(d[2], 10) + ', ' + d[0];
}

function postTemplate(meta, contentHtml) {
    const dateStr = formatDate(meta.date);
    const tagsStr = meta.tags.join(', ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${meta.title} \u2013 woojin's blog</title>
    <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
    <header class="site-header">
        <div class="site-title"><a href="/">woojin's blog</a></div>
        <div class="site-subtitle">my creative works</div>
        <nav>
            <a href="/">Home</a>
            <a href="/about/">About Me</a>
            <a href="/archive/">Index</a>
            <a href="/vinyls/">My Music</a>
        </nav>
    </header>
    <main class="site-main">
        <article>
            <div class="post-header">
                <a href="/" onclick="if(history.length>1){history.back();return false}" class="back-link"><img src="/assets/images/icons/exit.png" alt="Back"></a>
                <h1>${meta.title}</h1>
                <div class="post-meta">${dateStr} \xb7 ${tagsStr}</div>
            </div>
            <div class="post-content">
                ${contentHtml.trim()}
            </div>
        </article>
    </main>
    <footer class="site-footer">
        &copy; ${new Date().getFullYear()} woojin jang
    </footer>
    <script src="/assets/js/code.js"></script>
</body>
</html>
`;
}

function pageTemplate(meta, contentHtml, navActive) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${meta.title} \u2013 woojin's blog</title>
    <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
    <header class="site-header">
        <div class="site-title"><a href="/">woojin's blog</a></div>
        <div class="site-subtitle">my creative works</div>
        <nav>
            <a href="/">Home</a>
            <a href="/about/"${navActive === 'about' ? ' class="active"' : ''}>About Me</a>
            <a href="/archive/">Index</a>
            <a href="/vinyls/">My Music</a>
        </nav>
    </header>
    <main class="site-main">
        <div class="page-header">
            <h1>${meta.title}</h1>
        </div>
        <div class="page-content">
            ${contentHtml.trim()}
        </div>
    </main>
    <footer class="site-footer">
        &copy; ${new Date().getFullYear()} woojin jang
    </footer>
    <script src="/assets/js/code.js"></script>
</body>
</html>
`;
}

// ── Build helpers ───────────────────────────────────────────────────

function readMarkdownFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => {
            const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
            const { data, content } = matter(raw);
            if (data.date instanceof Date) {
                data.date = data.date.toISOString().split('T')[0];
            }
            return { file: f, meta: data, content };
        });
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

// ── Main ────────────────────────────────────────────────────────────

console.log('Building site from:', VAULT);
console.log('Output to:', SITE);
console.log('');

// Build posts
const posts = readMarkdownFiles(POSTS_SRC);
const postsIndex = [];

for (const post of posts) {
    const slug = post.meta.slug || path.basename(post.file, '.md');
    const outDir = path.join(POSTS_OUT, slug);
    ensureDir(outDir);

    imageIndex = 0;
    const html = marked.parse(post.content);
    const fullHtml = postTemplate(post.meta, html);

    fs.writeFileSync(path.join(outDir, 'index.html'), fullHtml, 'utf-8');
    console.log(`  post: ${slug}`);

    postsIndex.push({
        slug,
        title: post.meta.title,
        date: post.meta.date,
        tags: post.meta.tags || []
    });
}

// Sort posts by date descending
postsIndex.sort((a, b) => b.date.localeCompare(a.date));

// Write posts.json
ensureDir(path.dirname(POSTS_JSON));
fs.writeFileSync(POSTS_JSON, JSON.stringify(postsIndex, null, 4) + '\n', 'utf-8');
console.log(`\n  posts.json: ${postsIndex.length} entries`);

// Build pages
const pages = readMarkdownFiles(PAGES_SRC);

for (const page of pages) {
    const slug = page.meta.slug || path.basename(page.file, '.md');
    const outDir = path.join(SITE, slug);
    ensureDir(outDir);

    imageIndex = 0;
    const html = marked.parse(page.content);
    const fullHtml = pageTemplate(page.meta, html, page.meta.nav || '');

    fs.writeFileSync(path.join(outDir, 'index.html'), fullHtml, 'utf-8');
    console.log(`  page: ${slug}`);
}

// Copy new images from vault to site
if (imagesToCopy.size > 0) {
    ensureDir(IMAGES_OUT);
    for (const img of imagesToCopy) {
        const src = path.join(IMAGES_SRC, img);
        const dst = path.join(IMAGES_OUT, img);
        fs.copyFileSync(src, dst);
        console.log(`  image: ${img}`);
    }
    console.log(`\n  Copied ${imagesToCopy.size} image(s)`);
} else {
    console.log('\n  No new images to copy');
}

console.log('\nDone!');
