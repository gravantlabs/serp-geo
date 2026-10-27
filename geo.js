/**
 * @fileoverview Shared helpers: place lookup, Google location values and
 * small formatting utilities. Loaded by the popup, the compare page and the
 * service worker.
 */

/**
 * A place returned by the place search.
 * @typedef {{
 *   name: string,
 *   sub: string,
 *   gl: string,
 *   hl: string,
 *   lat: number,
 *   lng: number,
 * }}
 */
let Place;

/** Interface languages offered in the language picker. */
const UI_LANGS = 'en ar de es fr hi it ja ko nl pl pt ru tr zh-CN'.split(' ');

/**
 * Returns the flag emoji for a country code.
 * @param {string} cc Two-letter country code.
 * @return {string}
 */
function flag(cc) {
  // 127397 = U+1F1E6 (regional indicator A) - 'A'; two indicators form a flag.
  return String.fromCodePoint(
      ...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt()));
}

/**
 * Returns a key that identifies a place by its coordinates.
 * @param {{lat: number, lng: number}} l
 * @return {string}
 */
function key(l) {
  return `${l.lat.toFixed(5)},${l.lng.toFixed(5)}`;
}

/**
 * Lowercases text and removes diacritics, for loose matching.
 * @param {string} s
 * @return {string}
 */
function norm(s) {
  return s.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('en');
}

/**
 * Checks whether the location Google shows matches the chosen place.
 * @param {?{place: string}} v Location read from the results page.
 * @param {?Place} l Chosen place.
 * @return {boolean}
 */
function verified(v, l) {
  return !!(v && l) &&
      [l.name, l.sub.split(', ')[0]]
          .filter(Boolean)
          .some((x) => norm(v.place).includes(norm(x)));
}

/**
 * Encodes bytes as base64url.
 * @param {!Iterable<number>} bytes
 * @return {string}
 */
function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
}

/**
 * Returns the main language for a country code.
 * @param {string} cc Two-letter country code.
 * @return {string}
 */
function langFor(cc) {
  try {
    const l = new Intl.Locale(`und-${cc}`).maximize();
    if (l.language === 'zh') return l.script === 'Hant' ? 'zh-TW' : 'zh-CN';
    return l.language;
  } catch {
    return 'en';
  }
}

/**
 * Builds the `uule` URL parameter for a location.
 * @param {number} lat
 * @param {number} lng
 * @return {string}
 */
function uule(lat, lng) {
  // Text-format protobuf, prefixed with 'a ', base64url-encoded. The
  // timestamp is in microseconds.
  const t = [
    'role:1',
    'producer:12',
    'provenance:6',
    `timestamp:${Date.now() * 1000}`,
    'latlng{',
    `latitude_e7:${Math.round(lat * 1e7)}`,
    `longitude_e7:${Math.round(lng * 1e7)}`,
    '}',
    'radius:93000',
  ].join('\n');
  return 'a ' + b64url(new TextEncoder().encode(t));
}

/**
 * Builds the `X-Geo` request header value for a location.
 * @param {number} lat
 * @param {number} lng
 * @return {string}
 */
function xGeo(lat, lng) {
  const varint = (n) => {
    const b = [];
    while (n >= 128) {
      b.push(n % 128 | 128);
      n = Math.floor(n / 128);
    }
    b.push(n);
    return b;
  };
  const fixed = (set, v) => {
    const d = new DataView(new ArrayBuffer(4));
    d[set](0, v, true);
    return [...new Uint8Array(d.buffer)];
  };
  // Binary protobuf, prefixed with 'w ', base64url-encoded. Field tags:
  // 0x08 field 1 = 1, 0x10 field 2 = 12, 0x18 field 3 = timestamp in
  // microseconds, 0x2a field 5 = {latitude, longitude} as int32 * 1e7,
  // 0x3d field 7 = float 100000, 0xc8 0x01 field 25 = 2.
  const latlng = [
    0x0d, ...fixed('setInt32', Math.round(lat * 1e7)),
    0x15, ...fixed('setInt32', Math.round(lng * 1e7)),
  ];
  return 'w ' + b64url([
    0x08, 1,
    0x10, 12,
    0x18, ...varint(Date.now() * 1000),
    0x2a, latlng.length, ...latlng,
    0x3d, ...fixed('setFloat32', 100000),
    0xc8, 0x01, 2,
  ]);
}

/**
 * Searches places by name with Photon.
 * @param {string} q Search text.
 * @param {!AbortSignal} signal
 * @return {!Promise<!Array<!Place>>}
 */
async function places(q, signal) {
  const r = await fetch(
      `https://photon.komoot.io/api/?limit=6&q=${encodeURIComponent(q)}`,
      {signal});
  if (!r.ok) throw new Error(r.status);
  const {features} = await r.json();
  return features.filter((f) => f.properties.countrycode).map((f) => {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const parts = [p.district, p.city, p.state, p.country]
        .filter((v) => v && v !== p.name);
    return {
      name: p.name || p.city || p.country,
      sub: [...new Set(parts)].join(', '),
      gl: p.countrycode.toLowerCase(),
      hl: langFor(p.countrycode),
      lat,
      lng,
    };
  });
}

/**
 * Builds a Google search URL for a query at a place.
 * @param {string} q Search query.
 * @param {!Place} l Place.
 * @param {string=} hl Interface language; defaults to the place's language.
 * @return {string}
 */
function serpUrl(q, l, hl) {
  const params = [
    `q=${encodeURIComponent(q)}`,
    `hl=${hl || l.hl}`,
    `gl=${l.gl}`,
    `uule=${encodeURIComponent(uule(l.lat, l.lng))}`,
  ];
  return `https://www.google.com/search?${params.join('&')}`;
}
