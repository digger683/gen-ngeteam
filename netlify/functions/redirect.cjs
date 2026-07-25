const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
    host: 'aws-1-ap-southeast-1.pooler.supabase.com',
    database: 'postgres',
    user: 'postgres.vkgjvslafnshlsrrcrar',
    password: 'Melpost123@',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

// Bot detection
function isBot(userAgent) {
    if (!userAgent) return true; // Treat empty UA as bot/spam
    const ua = userAgent.toLowerCase();
    // Extensive list of bots and crawlers
    const bots = [
        'facebookexternalhit/1.1', 'twitterbot', 'whatsapp', 'linkedinbot',
        'pinterest', 'slackbot', 'telegrambot', 'discordbot', 'googlebot',
        'bingbot', 'yandex', 'duckduckgo', 'baidu', 'ahern', 'instagram',
        'mj12bot', 'semrush', 'ahrefs', 'dotbot', 'rogerbot', 'exabot'
    ];
    return bots.some(bot => ua.includes(bot));
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Detect OS from user agent
function detectOS(userAgent) {
    if (!userAgent) return 'Unknown';
    const ua = userAgent.toLowerCase();

    if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('windows phone')) return 'Windows Phone';
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('mac os') || ua.includes('macintosh')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('chrome os')) return 'Chrome OS';

    return 'Unknown';
}

exports.handler = async (event, context) => {
    const requestPath = event.path;
    const slug = requestPath.replace(/^\/+/, '').replace(/\/+$/, '');
    const userAgent = event.headers['user-agent'] || '';

    // Anti-Spam: Block requests with no User-Agent immediately
    if (!userAgent || userAgent.trim() === '') {
        return { statusCode: 403, body: 'Access Denied' };
    }

    // ... (rest of valid slug checks) ...

    // Try to find slug in database
    try {
        const result = await pool.query(
            `SELECT l.*, d.url as domain_url 
       FROM links l 
       JOIN domains d ON l.domain_id = d.id 
       WHERE l.slug = $1`,
            [slug]
        );

        // ... (not found check) ...
        if (result.rows.length === 0) {
            // ... returns SPA ...
        }

        // Found the link - handle redirect
        const link = result.rows[0];
        let target = link.original_url;

        // Ensure protocol exists
        if (!target.match(/^https?:\/\//)) {
            target = 'https://' + target;
        }

        const title = escapeHtml(link.title) || 'Link Preview';
        const description = escapeHtml(link.description) || 'Click to view this link';
        const image = escapeHtml(link.image_url) || '';

        // Get visitor info
        const country = event.headers['x-country'] || event.headers['cf-ipcountry'] || 'XX';
        const clientIP = event.headers['x-forwarded-for']?.split(',')[0] ||
            event.headers['client-ip'] ||
            event.headers['x-real-ip'] ||
            'unknown';

        // Extract click_id (same as before) ...
        let clickId = null;
        try {
            const targetUrl = new URL(target);
            clickId = targetUrl.searchParams.get('click_id') ||
                targetUrl.searchParams.get('clickid') ||
                targetUrl.searchParams.get('subid') ||
                null;
        } catch (e) { }

        const os = detectOS(userAgent);

        // Record click - MUST AWAIT to ensure it saves before function dies
        if (!isBot(userAgent)) {
            try {
                await pool.query(
                    `INSERT INTO clicks (link_id, slug, country, user_agent, ip_address, click_id, os) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [link.id, slug, country, userAgent.substring(0, 500), clientIP, clickId, os]
                );
            } catch (err) {
                console.error('Click tracking error:', err.message);
            }
        }

        // GEO-BLOCK: Redirect Indonesia if enabled for this link
        if (country === 'ID' && link.block_indonesia) {
            target = 'https://i.pinimg.com/736x/ec/bf/95/ecbf95a2b86066b6e0966989b118b8fb.jpg';
        }

        // CLOAKING: Serve OG tags for bots
        if (isBot(userAgent)) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'text/html' },
                body: `<!DOCTYPE html>
<html lang="en">
<head>
    <!-- BOT HTML -->
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    ${image ? `<meta property="og:image" content="${image}">` : ''}
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:title" content="${title}">
    <meta property="twitter:description" content="${description}">
    ${image ? `<meta property="twitter:image" content="${image}">` : ''}
</head>
<body></body>
</html>`
            };
        }

        // For humans: Show waiting page with JS redirect
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html',
                'Referrer-Policy': 'no-referrer'
            },
            body: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">
    <title>Waiting for you...</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #111827;
            ${image ? `background-image: url('${image}');` : ''}
            background-size: cover;
            background-position: center;
            background-blend-mode: overlay;
            color: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            font-family: 'Outfit', sans-serif;
        }
        body::before {
            content: '';
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: -1;
        }
        .loader {
            border: 3px solid rgba(255,255,255,0.1);
            border-left-color: #f97316;
            border-radius: 50%;
            width: 50px; height: 50px;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }
        h2 {
            font-weight: 300;
            letter-spacing: 1px;
            font-size: 1.2rem;
            margin: 0;
            opacity: 0.9;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="loader"></div>
    <h2>Waiting for you...</h2>
    <script>
        setTimeout(() => {
            window.location.replace("${target}");
        }, 1000);
    </script>
</body>
</html>`
        };

    } catch (error) {
        console.error('Redirect error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'text/html' },
            body: '<h1>500 Internal Server Error</h1><p>' + error.message + '</p>'
        };
    }
};
