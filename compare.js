/**
 * @fileoverview Compare page: one search shown for several places side by
 * side, each in its own frame, with a location check per frame.
 */

/**
 * The compare view: search term, places and interface language.
 * @type {{q: string, locs: !Array<!Place>, lang: (string|undefined)}}
 */
let view = {q: '', locs: [], lang: ''};

/** @type {!Array<!Place>} */
let saved = [];

/** @type {number|undefined} */
let searchTimer;

/** @type {?AbortController} */
let searchAbort = null;

/** Resolves when the service worker has registered this tab. */
const ready = chrome.runtime.sendMessage('compare');

/**
 * @param {string} id
 * @return {?HTMLElement}
 */
const byId = (id) => document.getElementById(id);

/**
 * Creates an element with properties and children.
 * @param {string} tag
 * @param {!Object=} props
 * @param {...(!Node|string)} children
 * @return {!HTMLElement}
 */
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
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

/** Saves the compare view. */
function persist() {
  chrome.storage.local.set({compare: view});
}

/** Redraws the place chips. */
function chips() {
  byId('place-chips').replaceChildren(...view.locs.map((place) => {
    const remove = el('button', {
      type: 'button',
      textContent: '×',
      ariaLabel: `Remove ${place.name}`,
      onclick: () => {
        view.locs = view.locs.filter((x) => key(x) !== key(place));
        persist();
        chips();
        panels();
      },
    });
    return el('li', {}, `${flag(place.gl)} ${place.name}`, remove);
  }));
}

/**
 * Returns the empty state shown before a search term and places are set.
 * @return {!HTMLElement}
 */
function emptyState() {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('width', 56);
  icon.setAttribute('height', 56);
  icon.setAttribute('viewBox', '0 0 20 20');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML =
      '<g fill="none" stroke="currentColor" stroke-width="1.2">' +
      '<rect x="2.5" y="3.5" width="6" height="13" rx="1.5"/>' +
      '<rect x="11.5" y="3.5" width="6" height="13" rx="1.5"/></g>';
  return el(
      'div', {className: 'empty'}, icon,
      el('b', {textContent: 'Compare one search across places'}),
      'Type what you want to search for, then add two or more places.');
}

/**
 * Builds the card for one place: header, location check and results frame.
 * @param {!Place} place
 * @return {!HTMLElement}
 */
function card(place) {
  const url = serpUrl(view.q, place, view.lang);
  const frame = el('iframe', {
    src: url,
    title: `Google results for ${view.q} in ${place.name}`,
    referrerPolicy: 'no-referrer',
  });
  frame.loc = place;
  frame.status = el('span', {className: 'badge', textContent: 'Checking…'});
  const open = el('a', {
    className: 'icon',
    href: url,
    target: '_blank',
    rel: 'noopener',
    ariaLabel: `Open ${place.name} results in a new tab`,
    title: 'Open in new tab',
  });
  open.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M9 3h4v4M13 3 7 9M11 9.5V13H3V5h3.5"/></svg>';
  const title = el(
      'div', {className: 'card-title'},
      el('b', {textContent: `${flag(place.gl)} ${place.name}`}),
      el('small', {textContent: place.sub}));
  return el(
      'section', {className: 'card'},
      el('header', {}, title, frame.status, open), frame);
}

/**
 * Redraws the result frames, or the empty state.
 * @return {!Promise<void>}
 */
async function panels() {
  if (!view.q || !view.locs.length) {
    byId('result-grid').replaceChildren(emptyState());
    return;
  }
  await ready;
  byId('result-grid').replaceChildren(...view.locs.map(card));
}

/**
 * Shows place suggestions, leaving out places already added.
 * @param {!Array<!Place>} list
 */
function suggest(list) {
  const items =
      list.filter((place) => !view.locs.some((x) => key(x) === key(place)));
  const box = byId('place-suggestions');
  box.hidden = !items.length;
  box.replaceChildren(...items.map((place) => {
    const button = el(
        'button', {
          type: 'button',
          onclick: () => {
            view.locs.push(place);
            persist();
            byId('place-input').value = '';
            box.hidden = true;
            chips();
            panels();
            byId('place-input').focus();
          },
        },
        el('b', {textContent: `${flag(place.gl)} ${place.name}`}),
        el('small', {textContent: place.sub}));
    return el('li', {}, button);
  }));
}

byId('place-input').addEventListener('focus', () => {
  if (!byId('place-input').value.trim()) suggest(saved);
});

byId('place-input').addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = byId('place-input').value.trim();
  if (query.length < 2) {
    searchAbort?.abort();
    suggest(saved);
    return;
  }
  searchTimer = setTimeout(async () => {
    searchAbort?.abort();
    searchAbort = new AbortController();
    try {
      suggest(await places(query, searchAbort.signal));
    } catch (e) {
      if (e.name !== 'AbortError') byId('place-suggestions').hidden = true;
    }
  }, 250);
});

byId('place-input').addEventListener('keydown', (e) => {
  const box = byId('place-suggestions');
  const first = box.querySelector('button');
  if (e.key === 'Enter' && first && !box.hidden) {
    e.preventDefault();
    first.click();
  }
  if (e.key === 'ArrowDown' && first) {
    e.preventDefault();
    first.focus();
  }
  if (e.key === 'Escape') box.hidden = true;
});

byId('place-suggestions').addEventListener('keydown', (e) => {
  const item = e.target.closest('li');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    item.nextElementSibling?.querySelector('button').focus();
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const previous = item.previousElementSibling?.querySelector('button');
    (previous || byId('place-input')).focus();
  }
  if (e.key === 'Escape') {
    byId('place-suggestions').hidden = true;
    byId('place-input').focus();
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.add-place')) {
    byId('place-suggestions').hidden = true;
  }
});

window.addEventListener('message', (e) => {
  if (e.origin !== 'https://www.google.com' ||
      !('serpGeo' in (e.data || {}))) {
    return;
  }
  const frame = [...document.querySelectorAll('iframe')].find(
      (x) => x.contentWindow === e.source);
  if (!frame) return;
  const shown = e.data.serpGeo;
  const matches = verified(shown, frame.loc);
  const state = shown ? (matches ? 'ok' : 'bad') : '';
  frame.status.className = `badge ${state}`;
  frame.status.textContent =
      shown ? `${matches ? '✓' : '✗'} ${shown.place}` : 'No location shown';
  frame.status.title =
      shown ? `Google shows results for ${shown.place} · ${shown.source}` : '';
});

byId('ui-lang').append(
    new Option('Local language', ''),
    ...UI_LANGS.map((code) => new Option(langName(code), code)));

byId('ui-lang').addEventListener('change', () => {
  view.lang = byId('ui-lang').value;
  persist();
  panels();
});

byId('compare-form').addEventListener('submit', (e) => {
  e.preventDefault();
  view.q = byId('search-term').value.trim();
  persist();
  panels();
});

chrome.storage.local.get(['compare', 'saved', 'active']).then((stored) => {
  saved = stored.saved || [];
  view = stored.compare || {
    q: '',
    locs: [stored.active, ...saved]
        .filter(Boolean)
        .filter((l, i, a) => a.findIndex((x) => key(x) === key(l)) === i)
        .slice(0, 3),
  };
  byId('search-term').value = view.q;
  byId('ui-lang').value = view.lang || '';
  chips();
  panels();
});
