/**
 * @fileoverview Service worker. Turns the saved place into request rules for
 * Google, keeps the toolbar icon in sync and tracks compare tabs.
 */

// Firefox runs this file as an event page with geo.js listed before it.
if (typeof importScripts === 'function') importScripts('geo.js');

/** Storage keys that change the request rules. */
const GEO_KEYS = ['enabled', 'hl', 'gl', 'lat', 'lng', 'lang'];

/**
 * IDs of the session rules this extension sets: request headers, search
 * parameters, and frame headers for compare tabs.
 */
const RULE_IDS = [1, 2, 3];

/** Toolbar icons by size. */
const ICONS = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png'
};

/** @type {?Object<string, !ImageData>} */
let greyIcons;

/**
 * Removes Google's `UULE` location cookie.
 * @return {!Promise<void>}
 */
async function clearUule() {
  const cookies =
      await chrome.cookies.getAll({domain: 'google.com', name: 'UULE'});
  await Promise.all(cookies.map((c) => chrome.cookies.remove({
    url: `http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`,
    name: c.name,
    storeId: c.storeId,
  })));
}

/**
 * Builds the session rules from the saved place and updates the toolbar.
 * @return {!Promise<void>}
 */
async function apply() {
  const settings = await chrome.storage.local.get(GEO_KEYS);
  const {compareTabs = []} = await chrome.storage.session.get('compareTabs');
  const ok = settings.enabled && settings.hl && settings.gl;
  const hl = settings.lang || settings.hl;
  const geo =
      ok && Number.isFinite(settings.lat) && Number.isFinite(settings.lng);
  const skip = compareTabs.length ? {excludedTabIds: compareTabs} : {};
  const rules = [];
  if (ok) {
    const lang = hl.includes('-') ?
        `${hl},${hl.split('-')[0]};q=0.9` :
        `${hl}-${settings.gl.toUpperCase()},${hl};q=0.9`;
    const headers = [
      {header: 'accept-language', operation: 'set', value: lang},
    ];
    if (geo) {
      headers.push({
        header: 'x-geo',
        operation: 'set',
        value: xGeo(settings.lat, settings.lng),
      });
    }
    rules.push({
      id: 1,
      priority: 1,
      action: {type: 'modifyHeaders', requestHeaders: headers},
      condition: {
        requestDomains: ['google.com'],
        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'],
        ...skip,
      },
    });
    const params = [{key: 'hl', value: hl}, {key: 'gl', value: settings.gl}];
    if (geo)
      params.push({key: 'uule', value: uule(settings.lat, settings.lng)});
    rules.push({
      id: 2,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {transform: {queryTransform: {addOrReplaceParams: params}}},
      },
      condition: {
        urlFilter: '||google.com/search?',
        resourceTypes: ['main_frame'],
        ...skip,
      },
    });
  }
  if (compareTabs.length) {
    rules.push({
      id: 3,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          {header: 'x-frame-options', operation: 'remove'},
          {header: 'content-security-policy', operation: 'remove'},
        ],
      },
      condition: {
        tabIds: compareTabs,
        requestDomains: ['google.com'],
        resourceTypes: ['sub_frame'],
      },
    });
  }
  // Removing fixed IDs (Chrome ignores missing ones) keeps the update one
  // atomic call. Reading the current rules first let two overlapping calls
  // both add rule 1 and fail with a duplicate ID.
  await chrome.declarativeNetRequest.updateSessionRules(
      {removeRuleIds: RULE_IDS, addRules: rules});
  await chrome.action.setBadgeText({text: ''});
  await chrome.action.setIcon(ok ? {path: ICONS} : {imageData: await grey()});
  const {active} = await chrome.storage.local.get('active');
  await chrome.action.setTitle({
    title: ok ? `SERP Geo: on · ${active?.name || settings.gl.toUpperCase()}` :
                'SERP Geo: off',
  });
}

/**
 * Returns a grey, faded copy of one icon.
 * @param {string} path Icon file in the extension.
 * @param {number} size Icon size in pixels.
 * @return {!Promise<!ImageData>}
 */
async function fade(path, size) {
  const res = await fetch(chrome.runtime.getURL(path));
  const bitmap = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(size, size).getContext('2d');
  c.drawImage(bitmap, 0, 0, size, size);
  const d = c.getImageData(0, 0, size, size);
  const a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    // Luma weights (ITU-R BT.601).
    const y = a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11;
    a[i] = a[i + 1] = a[i + 2] = y;
    a[i + 3] *= .45;
  }
  return d;
}

/**
 * Returns the toolbar icons for the off state.
 * @return {!Promise<!Object<string, !ImageData>>}
 */
async function grey() {
  if (!greyIcons) {
    const entries = await Promise.all(Object.entries(ICONS).map(
        async ([n, p]) => [n, await fade(p, Number(n))]));
    greyIcons = Object.fromEntries(entries);
  }
  return greyIcons;
}

/**
 * Updates the list of compare tabs and rebuilds the rules.
 * @param {function(!Array<number>): !Array<number>} fn
 * @return {!Promise<void>}
 */
async function setCompareTabs(fn) {
  const {compareTabs = []} = await chrome.storage.session.get('compareTabs');
  await chrome.storage.session.set({compareTabs: fn(compareTabs)});
  await apply();
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: [1]});
  chrome.alarms.create('refresh', {periodInMinutes: 60});
  apply();
});

chrome.runtime.onStartup.addListener(
    () => chrome.storage.session.set({compareTabs: []}).then(apply));

chrome.alarms.onAlarm.addListener(apply);

chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && GEO_KEYS.some((k) => k in c)) {
    apply().then(clearUule);
  }
});

chrome.tabs.onRemoved.addListener(async (id) => {
  const {compareTabs = []} = await chrome.storage.session.get('compareTabs');
  chrome.storage.session.remove(`v${id}`);
  if (compareTabs.includes(id)) {
    setCompareTabs((t) => t.filter((x) => x !== id));
  }
});

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m?.verify !== undefined) {
    if (sender.tab && sender.frameId === 0) {
      chrome.storage.session.set(
          {[`v${sender.tab.id}`]: {...m.verify, url: sender.url}});
    }
    return;
  }
  if (m === 'apply') {
    apply().then(() => reply(true), () => reply(false));
    return true;
  }
  if (m !== 'compare' || !sender.tab) return;
  setCompareTabs((t) => [...new Set([...t, sender.tab.id])])
      .then(() => reply(true), () => reply(false));
  return true;
});
