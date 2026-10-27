/**
 * @fileoverview Toolbar popup: place search, saved places, on/off switch,
 * interface language and the location check for the current tab.
 */

/**
 * Saved settings, mirrored from `chrome.storage.local`.
 * @type {!Object}
 */
let state = {saved: []};

/**
 * Places shown instead of the default list while the user searches.
 * @type {?Array<!Place>}
 */
let results = null;

/** @type {number|undefined} */
let searchTimer;

/** @type {?AbortController} */
let searchAbort = null;

/**
 * Place search results by query, kept for this browser session.
 * @type {!Map<string, !Array<!Place>>}
 */
const cache = new Map();

/**
 * @param {string} id
 * @return {?HTMLElement}
 */
const byId = (id) => document.getElementById(id);

/**
 * Shows a status message under the list.
 * @param {string} text
 * @param {boolean=} isError
 */
function showMessage(text, isError) {
  byId('status-message').textContent = text;
  byId('status-message').className = isError ?
      'status-message error' :
      'status-message';
}

/**
 * @param {!Place} place
 * @return {boolean} Whether the place is saved.
 */
function isSaved(place) {
  return state.saved.some((s) => key(s) === key(place));
}

/**
 * Returns a language name in the browser's language.
 * @param {string} code
 * @return {string}
 */
function langName(code) {
  const names = new Intl.DisplayNames(
      [chrome.i18n.getUILanguage()], {type: 'language'});
  return names.of(code) || code;
}

/**
 * Builds one list row: the place, a check mark when active, a star button.
 * @param {!Place} place
 * @return {!HTMLLIElement}
 */
function row(place) {
  const item = document.createElement('li');
  if (state.enabled && state.lat != null && key(place) === key(state)) {
    item.setAttribute('aria-current', 'true');
  }
  const pickButton = document.createElement('button');
  pickButton.className = 'place-button';
  pickButton.append(
      Object.assign(
          document.createElement('b'),
          {textContent: `${flag(place.gl)} ${place.name}`}),
      Object.assign(document.createElement('small'), {textContent: place.sub}));
  pickButton.addEventListener('click', () => pick(place));
  item.append(pickButton);
  if (item.hasAttribute('aria-current')) {
    item.append(Object.assign(
        document.createElement('span'),
        {className: 'check', textContent: '✓', ariaHidden: 'true'}));
  }
  const starred = isSaved(place);
  const starButton = document.createElement('button');
  starButton.className = 'star';
  starButton.textContent = starred ? '★' : '☆';
  starButton.setAttribute('aria-pressed', starred);
  starButton.setAttribute(
      'aria-label', `${starred ? 'Remove' : 'Save'} ${place.name}`);
  starButton.addEventListener('click', () => {
    const saved = starred ?
        state.saved.filter((s) => key(s) !== key(place)) :
        [place, ...state.saved];
    save({saved});
  });
  item.append(starButton);
  return item;
}

/** Redraws the switch and the place list. */
function render() {
  byId('geo-switch').checked = !!state.enabled;
  byId('geo-switch').disabled = state.lat == null;
  const active =
      state.active && !isSaved(state.active) ? [state.active] : [];
  byId('place-list').replaceChildren(
      ...(results || [...active, ...state.saved]).map(row));
  if (!results && !active.length && !state.saved.length) {
    showMessage('Type a city, district or address to start.');
  }
}

/**
 * Saves settings. With `reload`, applies them and reloads the Google tab
 * without its old location parameters.
 * @param {!Object} patch
 * @param {boolean=} reload
 * @return {!Promise<void>}
 */
async function save(patch, reload) {
  state = {...state, ...patch};
  // Only the changed keys: writing the whole state would overwrite values
  // the compare page saved while this popup was open.
  await chrome.storage.local.set(patch);
  render();
  if (!reload) return;
  await chrome.runtime.sendMessage('apply');
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab?.url || !/^https?:\/\/([^/]+\.)?google\.com\//.test(tab.url)) return;
  const url = new URL(tab.url);
  ['uule', 'hl', 'gl'].forEach((k) => url.searchParams.delete(k));
  chrome.tabs.update(tab.id, {url: url.href});
}

/**
 * Makes a place the active location.
 * @param {!Place} place
 */
function pick(place) {
  byId('place-query').value = '';
  results = null;
  showMessage('');
  save(
      {
        enabled: true,
        hl: place.hl,
        gl: place.gl,
        lat: place.lat,
        lng: place.lng,
        active: place,
      },
      true);
}

/**
 * Searches places and shows the results. Uses the cache when it can.
 * @param {string} query
 * @return {!Promise<void>}
 */
async function search(query) {
  searchAbort?.abort();
  searchAbort = new AbortController();
  try {
    const found = cache.get(query) || await places(query, searchAbort.signal);
    if (!cache.has(query)) {
      cache.set(query, found);
      chrome.storage.session.set({places: [...cache].slice(-50)});
    }
    showMessage(found.length ? '' : 'No places match. Try another spelling.');
    results = found;
    render();
  } catch (e) {
    if (e.name !== 'AbortError') {
      showMessage(
          `Search didn't work (${e.message}). ` +
              'Check your connection and try again.',
          true);
    }
  }
}

/**
 * Shows which location Google used on the current tab, with ✓ or ✗.
 * @return {!Promise<void>}
 */
async function showLocationCheck() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  const shown =
      tab && (await chrome.storage.session.get(`v${tab.id}`))[`v${tab.id}`];
  const box = byId('location-check');
  box.hidden = !shown || shown.url !== tab.url;
  if (box.hidden) return;
  if (!shown.place) {
    box.replaceChildren('Google didn\'t show a location on this page.');
    return;
  }
  const wanted = state.enabled ? state.active : null;
  const matches = verified(shown, wanted);
  const mark = wanted ?
      [Object.assign(document.createElement('span'), {
        className: matches ? 'ok' : 'bad',
        textContent: matches ? '✓ ' : '✗ ',
      })] :
      [];
  box.replaceChildren(
      ...mark, 'Google shows results for ',
      Object.assign(document.createElement('b'), {textContent: shown.place}),
      ` · ${shown.source}`);
}

byId('place-query').addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = byId('place-query').value.trim();
  showMessage('');
  if (query.length < 2) {
    searchAbort?.abort();
    results = null;
    render();
    return;
  }
  if (cache.has(query)) {
    search(query);
    return;
  }
  results = state.saved.filter(
      (p) => norm(`${p.name} ${p.sub}`).includes(norm(query)));
  render();
  searchTimer = setTimeout(() => search(query), 150);
});

byId('place-query').addEventListener('keydown', (e) => {
  const first = byId('place-list').querySelector('.place-button');
  if (e.key === 'Enter' && first) {
    e.preventDefault();
    first.click();
  }
  if (e.key === 'ArrowDown' && first) {
    e.preventDefault();
    first.focus();
  }
  if (e.key === 'Escape' && byId('place-query').value) {
    e.preventDefault();
    byId('place-query').value = '';
    results = null;
    render();
  }
});

byId('place-list').addEventListener('keydown', (e) => {
  const item = e.target.closest('li');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    item.nextElementSibling?.querySelector('.place-button').focus();
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const previous =
        item.previousElementSibling?.querySelector('.place-button');
    (previous || byId('place-query')).focus();
  }
});

chrome.storage.session.onChanged.addListener(showLocationCheck);
chrome.storage.session.get('places').then((stored) => {
  (stored.places || []).forEach(([query, found]) => cache.set(query, found));
});

byId('ui-lang').append(
    new Option('Local language', ''),
    ...UI_LANGS.map((code) => new Option(langName(code), code)));
byId('ui-lang').addEventListener(
    'change', () => save({lang: byId('ui-lang').value}, true));
byId('open-compare').addEventListener(
    'click', () => chrome.tabs.create({url: 'compare.html'}));
byId('geo-switch').addEventListener(
    'change', () => save({enabled: byId('geo-switch').checked}, true));

chrome.storage.local.get(null).then((stored) => {
  state = {saved: [], ...stored};
  byId('ui-lang').value = state.lang || '';
  render();
  showLocationCheck();
});
