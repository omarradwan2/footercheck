// FooterCheck scanner — checks a website for the basic legal pages and privacy setup.
// No dependencies: Node 18+ (global fetch).

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 FooterCheck/1.0';
const MAX_HTML = 2_000_000;
const MAX_JS = 4_000_000;
const TIMEOUT = 12_000;

async function get(url, max = MAX_HTML) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const reader = res.body?.getReader();
    let size = 0;
    const chunks = [];
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        chunks.push(value);
        if (size > max) { ctrl.abort(); break; }
      }
    }
    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    return { ok: res.ok, status: res.status, url: res.url, text, type: res.headers.get('content-type') || '' };
  } catch (e) {
    return { ok: false, status: 0, url, text: '', error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(t);
  }
}

function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Enter a website address');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  if (!u.hostname.includes('.')) throw new Error('That does not look like a website address');
  // block private/local targets
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/i.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname))
    throw new Error('That address is not public');
  return u.toString();
}

const stripTags = (h) =>
  h.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

function links(html, base) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = (m[1].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    let abs = href;
    try { abs = new URL(href, base).toString(); } catch {}
    out.push({ href: abs, raw: href, text: stripTags(m[2]).slice(0, 120) });
  }
  return out;
}

function scripts(html, base) {
  const out = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    try { out.push(new URL(m[1], base).toString()); } catch {}
  }
  // modulepreload links (Vite builds)
  const re2 = /<link\b[^>]*rel\s*=\s*["']modulepreload["'][^>]*href\s*=\s*["']([^"']+)["']/gi;
  while ((m = re2.exec(html))) {
    try { out.push(new URL(m[1], base).toString()); } catch {}
  }
  return [...new Set(out)];
}

const TRACKERS = [
  ['Google Analytics', /googletagmanager\.com\/gtag|google-analytics\.com|gtag\(\s*['"]config['"]\s*,\s*['"]G-/i],
  ['Google Tag Manager', /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{5,}/],
  ['Google Ads', /googleadservices\.com|AW-\d{6,}|googlesyndication\.com/i],
  ['Meta Pixel', /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init/i],
  ['TikTok Pixel', /analytics\.tiktok\.com|ttq\.load\(/i],
  ['Hotjar', /static\.hotjar\.com|hjid\s*:/i],
  ['Microsoft Clarity', /clarity\.ms\/tag/i],
  ['Segment', /cdn\.segment\.com/i],
  ['Mixpanel', /cdn\.mxpnl\.com|mixpanel\.init\(/i],
  ['PostHog', /posthog\.init\(|i\.posthog\.com|us\.posthog\.com|eu\.posthog\.com/i],
  ['LinkedIn Insight', /snap\.licdn\.com/i],
  ['X/Twitter Pixel', /static\.ads-twitter\.com/i],
  ['Snap Pixel', /sc-static\.net\/scevent/i],
];
const AD_TRACKERS = new Set(['Google Ads', 'Meta Pixel', 'TikTok Pixel', 'LinkedIn Insight', 'X/Twitter Pixel', 'Snap Pixel']);

const CONSENT =
  /cookiebot|onetrust|cookielaw\.org|osano|termly|iubenda|cookieyes|cookie-script|klaro|usercentrics|complianz|cookiehub|didomi|quantcast\s*choice|consentmanager|trustarc|cookie-consent|cookieconsent|vanilla-cookieconsent|gdpr-cookie|consent\s*banner|accept\s+(all\s+)?cookies|we use cookies|this (web)?site uses cookies|cookie (settings|preferences)/i;

const PLATFORMS = [
  ['Lovable', /lovable\.app|lovable\.dev|gpt-engineer|lovable-tagger|gptengineer/i],
  ['Bolt', /bolt\.new|bolt\.host|stackblitz/i],
  ['v0 / Vercel', /v0\.dev|vusercontent\.net/i],
  ['Replit', /\.replit\.app|\.repl\.co|replit\.com/i],
  ['Base44', /base44/i],
  ['Framer', /framer\.(app|website|com\/m)|framerusercontent/i],
  ['Webflow', /webflow\.(io|com)|data-wf-site/i],
  ['Wix', /wix\.com|wixstatic|parastorage/i],
  ['Squarespace', /squarespace/i],
  ['Carrd', /carrd\.co/i],
  ['Softr', /softr\.(app|io)/i],
  ['Bubble', /bubble\.io|bubbleapps\.io/i],
  ['Shopify', /cdn\.shopify\.com|myshopify\.com/i],
  ['WordPress', /wp-content|wp-includes/i],
  ['Netlify', /netlify\.app/i],
  ['Vercel', /vercel\.app/i],
];
const VIBE = new Set(['Lovable', 'Bolt', 'v0 / Vercel', 'Replit', 'Base44']);

const KIDS =
  /\b(for kids|kids'? (games|app|learning|activities)|children'?s (games|app|learning)|for children|ages? [3-9]\s*[-–to]+\s*1[0-2]|ages? [3-9]\+|preschool|kindergarten|elementary school|grade [1-6]\b|homework help for kids|parents and kids|kid-friendly|for toddlers|young learners)\b/i;

const PRIVACY_LINK = /privacy|datenschutz|privacidad|confidentialit/i;
const TERMS_LINK = /terms|conditions|\btos\b|legal|nutzungsbedingungen|agb|términos/i;
const CONTACT_LINK = /contact|support|help|get in touch|about/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function detectAll(text) {
  const trackers = TRACKERS.filter(([, re]) => re.test(text)).map(([n]) => n);
  const platforms = PLATFORMS.filter(([, re]) => re.test(text)).map(([n]) => n);
  return { trackers, platforms, consent: CONSENT.test(text) };
}

async function scan(input) {
  const url = normalizeUrl(input);
  const started = Date.now();
  const home = await get(url);
  if (!home.ok && !home.text) {
    return { url, reachable: false, error: home.error || `HTTP ${home.status}`, checks: [], score: null };
  }
  const finalUrl = home.url || url;
  const html = home.text;
  const visible = stripTags(html);
  const allLinks = links(html, finalUrl);

  // Single-page apps (Lovable/Bolt/v0) render the footer with JS, so read the bundles too.
  const host = new URL(finalUrl).host;
  const jsUrls = scripts(html, finalUrl).filter((s) => new URL(s).host === host).slice(0, 5);
  let bundle = '';
  for (const js of jsUrls) {
    const r = await get(js, MAX_JS);
    if (r.ok) bundle += '\n' + r.text;
  }
  const isSpa = visible.length < 400 && /<div[^>]+id=["'](root|app|__next)["']/i.test(html);
  const corpus = html + '\n' + bundle;

  const det = detectAll(corpus + ' ' + finalUrl);
  const platform = det.platforms.find((p) => VIBE.has(p)) || det.platforms[0] || null;
  const vibeCoded = det.platforms.some((p) => VIBE.has(p));

  // --- privacy policy
  let privacyLink = allLinks.find((l) => PRIVACY_LINK.test(l.text) || PRIVACY_LINK.test(l.raw));
  let privacyInBundle = false;
  if (!privacyLink && bundle) {
    const m = bundle.match(/["'`](\/(?:[a-z-]+\/)?privacy[a-z-]*)["'`]/i);
    if (m) { privacyInBundle = true; privacyLink = { href: new URL(m[1], finalUrl).toString(), raw: m[1], text: 'Privacy (route in app code)' }; }
    else if (/privacy policy/i.test(bundle)) { privacyInBundle = true; privacyLink = { href: null, raw: '', text: 'Privacy Policy (text in app code)' }; }
  }
  let privacyWords = null;
  let privacyQuality = null;
  if (privacyLink?.href && !privacyInBundle) {
    const p = await get(privacyLink.href);
    if (p.ok) {
      const t = stripTags(p.text);
      privacyWords = t.split(' ').length;
      const hits = ['collect', 'personal', 'information', 'data', 'contact', 'cookie', 'third'].filter((w) => t.toLowerCase().includes(w)).length;
      privacyQuality = privacyWords >= 300 && hits >= 4 ? 'real' : 'thin';
    } else privacyQuality = 'broken';
  }

  // --- terms
  let termsLink = allLinks.find((l) => TERMS_LINK.test(l.text) || /\/(terms|tos|legal|conditions)/i.test(l.raw));
  if (!termsLink && bundle) {
    const m = bundle.match(/["'`](\/(?:[a-z-]+\/)?(?:terms|tos|legal)[a-z-]*)["'`]/i);
    if (m) termsLink = { href: new URL(m[1], finalUrl).toString(), raw: m[1], text: 'Terms (route in app code)' };
    else if (/terms of (service|use)|terms (&|and) conditions/i.test(bundle)) termsLink = { href: null, text: 'Terms (text in app code)' };
  }

  // --- contact
  const mailto = allLinks.find((l) => /^mailto:/i.test(l.raw));
  const contactLink = allLinks.find((l) => /contact|support/i.test(l.text) || /\/(contact|support)/i.test(l.raw));
  const emailMatch = (visible.match(EMAIL_RE) || bundle.match(/mailto:([^"'`\s]+)/i) || [])[0] || null;
  const email = mailto ? mailto.raw.replace(/^mailto:/i, '').split('?')[0] : emailMatch ? emailMatch.replace(/^mailto:/i, '') : null;

  // --- data collection
  const collects =
    /<input[^>]+type=["']?(email|password|tel)/i.test(html) ||
    /type:\s*["'](email|password)["']|type=\\?["'](email|password)/i.test(bundle) ||
    /supabase|firebase|clerk|auth0|stripe\.com\/v3|signInWith|signUp|createUserWithEmail/i.test(corpus);

  const kids = KIDS.test(visible) || KIDS.test(bundle.slice(0, 3_000_000));

  const checks = [];
  const add = (id, label, status, weight, detail, fix) => checks.push({ id, label, status, weight, detail, fix });

  add('https', 'Secure connection (HTTPS)', finalUrl.startsWith('https://') ? 'pass' : 'fail', 10,
    finalUrl.startsWith('https://') ? 'Site loads over HTTPS.' : 'Site loads over plain HTTP.',
    'Turn on SSL at your host; most give it free.');

  if (!privacyLink) {
    add('privacy', 'Privacy policy', 'fail', 30,
      collects ? 'No privacy policy found, and the site collects personal info (sign-up, email or login).' : 'No privacy policy link found on the homepage.',
      'Add a privacy policy page and link it in the footer. California law (CalOPPA) requires one for any commercial site collecting personal info from Californians, and the App Store requires one for every app.');
  } else if (privacyQuality === 'thin' || privacyQuality === 'broken') {
    add('privacy', 'Privacy policy', 'warn', 30,
      privacyQuality === 'broken' ? 'There is a privacy link but the page does not load.' : `Privacy page found but it is thin (${privacyWords} words) and probably a placeholder.`,
      'Replace it with a real policy: what you collect, why, who you share with, how users contact you, and the effective date.');
  } else {
    add('privacy', 'Privacy policy', 'pass', 30,
      privacyInBundle ? 'Privacy policy route found in the app code.' : `Privacy policy linked${privacyWords ? ` (${privacyWords} words)` : ''}.`, null);
  }

  add('terms', 'Terms of service', termsLink ? 'pass' : 'fail', 15,
    termsLink ? 'Terms page found.' : 'No terms of service found.',
    'Add terms of service: limits your liability, sets refund and account rules.');

  if (det.trackers.length) {
    add('cookies', 'Cookie consent', det.consent ? 'pass' : 'fail', 15,
      det.consent ? `Tracking (${det.trackers.join(', ')}) with a cookie banner.` : `Uses ${det.trackers.join(', ')} with no cookie banner detected.`,
      'Add a cookie consent banner that blocks tracking until the visitor accepts (required for EU/UK visitors, expected in California).');
  } else {
    add('cookies', 'Cookie consent', 'pass', 15, 'No third-party trackers detected, so no banner is needed.', null);
  }

  add('contact', 'Contact info', email || contactLink ? 'pass' : 'fail', 10,
    email ? `Contact email: ${email}` : contactLink ? 'Contact page linked.' : 'No contact email or contact page found.',
    'Show a contact email or contact page; privacy laws require a way to reach you about data requests.');

  const adPixels = det.trackers.filter((t) => AD_TRACKERS.has(t));
  const dns = /do not sell|do not share|your privacy choices|opt[- ]out of (sale|sharing)/i.test(corpus);
  if (adPixels.length) {
    add('optout', '"Do Not Sell or Share" link', dns ? 'pass' : 'warn', 5,
      dns ? 'Opt-out link present.' : `Uses ad pixels (${adPixels.join(', ')}) with no "Do Not Sell or Share" / "Your Privacy Choices" link.`,
      'Add a "Your Privacy Choices" link so visitors can opt out of ad tracking.');
  }

  if (kids) {
    add('kids', 'Kids\' privacy (COPPA)', collects || det.trackers.length ? 'fail' : 'warn', 15,
      collects || det.trackers.length
        ? 'Looks aimed at children and collects data or runs trackers. COPPA penalties run over $50,000 per violation.'
        : 'Content looks aimed at children. If kids under 13 sign up or are tracked, COPPA applies.',
      'Get verifiable parental consent before collecting anything from under-13s, remove ad trackers, and add a children\'s privacy section.');
  }

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.status === 'pass' ? c.weight : c.status === 'warn' ? c.weight / 2 : 0), 0);
  const score = Math.round((got / total) * 100);
  const failed = checks.filter((c) => c.status !== 'pass').length;

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim().replace(/\s+/g, ' ').slice(0, 120) || null;

  return {
    url: finalUrl, title, reachable: true, score, failed, grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F',
    platform, vibeCoded, spa: isSpa, collectsData: collects, kidsSignals: kids,
    trackers: det.trackers, email, checks, ms: Date.now() - started,
  };
}

module.exports = { scan, normalizeUrl, _internal: { links, scripts, stripTags, detectAll } };
