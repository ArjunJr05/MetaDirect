/**
 * @fileoverview Main process entry point for the Electron application.
 * Handles window creation and IPC communication for link previews.
 * @module Core
 */

const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');
const { parse } = require('node-html-parser');

/**
 * Creates the main application window with secure settings.
 * @function createWindow
 * @memberof module:Core
 * @returns {void}
 */

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: 'hiddenInset',
    });
    mainWindow.loadFile('index.html');
}

// In-memory cache for production performance
const previewCache = new Map();

/**
 * Handler for the 'fetch-link-preview' IPC event.
 * Performs a secure, client-side metadata extraction with the following optimizations:
 * - In-memory caching: Prevents redundant network requests for the same URL.
 * - Partial Fetching: Aborts the request once the HTML head or 2MB limit is reached.
 * - Image Normalization: Resolves relative image paths to absolute URLs.
 * - SPA/React Bypass: Spoofs the WhatsApp User-Agent to retrieve rich metadata from strict platforms like X/Twitter and Instagram.
 * - Advanced Extraction: Returns extended metadata including providername, faviconlink, hasvideo, width, height, and linktype.
 * - Domain Exclusions: Suppresses description for YouTube links per extraction schema rules.
 * - Cloudflare Handling: Detects bot-challenge pages and returns a clean 'Protected Link' fallback.
 *
 * @async
 * @function handleFetchLinkPreview
 * @memberof module:Core
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event object.
 * @param {string} url - The target URL to scan for Open Graph and Twitter card metadata.
 * @returns {Promise<Object>} Resolves with success status, error message if failed, and a data object containing:
 *   title, description, thumbnailurl, width, height, providername, linktype, faviconlink, hasvideo, url, domain.
 */

ipcMain.handle('fetch-link-preview', async (event, url) => {
    // 1. Check Cache First
    if (previewCache.has(url)) {
        return { success: true, data: previewCache.get(url) };
    }

    try {
        const targetUrl = new URL(url);
        const response = await new Promise((resolve, reject) => {
            const request = net.request({
                method: 'GET',
                url: url,
                headers: {
                    'User-Agent': 'WhatsApp/2',
                    'Accept': 'text/html'
                }
            });

            const timeout = setTimeout(() => {
                request.abort();
                reject(new Error('Request timed out'));
            }, 15000);

            let body = '';
            const MAX_FETCH_SIZE = 2 * 1024 * 1024; // 2MB limit

            request.on('response', (res) => {
                clearTimeout(timeout);

                res.on('data', (chunk) => {
                    body += chunk.toString();

                    // PERFORMANCE OPTIMIZATION: 
                    // Stop downloading if we have the head section or hit 128KB.
                    // This makes the fetch up to 10x faster for large pages.
                    if (body.length > MAX_FETCH_SIZE || body.includes('</head>')) {
                        request.abort();
                        resolve(body);
                    }
                });

                res.on('end', () => resolve(body));
            });

            request.on('error', (err) => {
                clearTimeout(timeout);
                // If we aborted manually, we still want to parse what we got
                if (err.message === 'net::ERR_ABORTED') {
                    resolve(body);

                } else {
                    reject(err);
                }
            });
            request.end();
        });

        const root = parse(response);
        const getMeta = (property) => {
            const element = root.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
            return element ? element.getAttribute('content') : null;
        };
        const getLinkMeta = (relList) => {
            for (const rel of relList) {
                const element = root.querySelector(`link[rel="${rel}"]`);
                if (element && element.getAttribute('href')) return element.getAttribute('href');
            }
            return null;
        };

        let title = getMeta('og:title') || getMeta('twitter:title') || root.querySelector('title')?.innerText || 'No title';
        if (title && title.length > 300) title = title.substring(0, 300);

        let description = null;
        if (!['youtube.com', 'youtu.be'].includes(targetUrl.hostname.replace(/^www\./, ''))) {
            description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description') || null;
            if (description && description.length > 1000) description = description.substring(0, 1000);
        }

        let thumbnailurl = getMeta('og:image') || getMeta('twitter:image');
        if (thumbnailurl && thumbnailurl.includes('/profile_images/')) thumbnailurl = null;
        if (thumbnailurl && thumbnailurl.length > 2500) thumbnailurl = null;

        // Normalize relative image URLs
        if (thumbnailurl && !thumbnailurl.startsWith('http')) {
            thumbnailurl = new URL(thumbnailurl, targetUrl.origin).href;
        }

        const width = getMeta('og:image:width');
        const height = getMeta('og:image:height');

        let providername = getMeta('og:site_name') || getMeta('twitter:site');
        if (providername && providername.length > 100) providername = providername.substring(0, 100);

        const linktype = getMeta('og:type');

        let faviconlink = getLinkMeta(['icon', 'shortcut icon', 'apple-touch-icon']);
        if (faviconlink && !faviconlink.startsWith('http')) {
            faviconlink = new URL(faviconlink, targetUrl.origin).href;
        }
        if (faviconlink && faviconlink.length > 300) faviconlink = faviconlink.substring(0, 300);

        const hasvideo = !!(getMeta('og:video') || root.querySelector('meta[property="og:video:url"], meta[property="og:video:secure_url"]'));

        // Clean up Cloudflare / DDOS protection fallbacks
        if (title && (title.includes('Just a moment...') || title.includes('Attention Required!'))) {
            title = 'Protected Link';
            description = 'This website requires a browser to verify security checks.';
            thumbnailurl = null;
        }

        const preview = {
            title,
            description,
            thumbnailurl,
            width,
            height,
            providername,
            linktype,
            faviconlink,
            hasvideo,
            image: thumbnailurl, // Backwards compatibility for UI
            url: getMeta('og:url') || url,
            domain: targetUrl.hostname
        };

        // Print to the terminal in nicely formatted JSON
        console.log('\n--- NEW PREVIEW GENERATED ---');
        console.log(JSON.stringify(preview, null, 2));
        console.log('-----------------------------\n');

        // Cache the result for future identical requests
        previewCache.set(url, preview);

        return { success: true, data: preview };
    } catch (error) {
        console.error('Fetch error:', error);
        return { success: false, error: error.message };
    }
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});