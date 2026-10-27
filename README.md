# SERP Geo

A browser extension for Chrome, Firefox and LibreWolf that shows Google results as people in another city see them. You can also compare one search across several places, side by side.

## Install

Download the file for your browser from [Releases](https://github.com/gravantlabs/serp-geo/releases/latest).

### Chrome

1. Download `serp-geo-chrome.zip` and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Select **Load unpacked** and choose the unzipped folder.

### Firefox and LibreWolf

1. Download `serp-geo-firefox.xpi`.
2. Open `about:config` and set `xpinstall.signatures.required` to `false`.
3. Open `about:addons`, select the gear button, then **Install Add-on From File**, and choose `serp-geo-firefox.xpi`.

Step 2 works in LibreWolf, Firefox Developer Edition and Firefox Nightly. Standard Firefox installs only add-ons that Mozilla has signed. In standard Firefox, load the add-on for one session instead: open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on** and choose `serp-geo-firefox.xpi`. Firefox removes it when it closes.

Firefox 128 or later is required. If you turn off the extension's access to `google.com` in `about:addons`, it stops working.

### From source

Chrome and Firefox use the same files. Load this folder as it is, or run `npm install` and `npm run build`. The build writes a minified copy to `dist/`, then packs it into `serp-geo-chrome.zip` and `serp-geo-firefox.xpi`.

## Use

1. Open the extension and type a city, district or address.
2. Select a place. The switch turns on.
3. Search on Google. The results are for the place you chose.

- The toolbar icon is in colour when a place is on, and grey when it is off.
- Star a place to keep it in the list.
- **Google language** changes only the language of Google's menus.
- **Compare results across places** opens one search for several places, side by side.
- Under the search box, a ✓ or ✗ shows if Google's results page names the place you chose.

## How it works

For `google.com` searches, the extension:

- adds the `hl`, `gl` and `uule` parameters to the search URL;
- sets the `Accept-Language` and `X-Geo` request headers;
- removes the `UULE` cookie when you change the place.

`uule` and `X-Geo` hold the latitude and longitude of the place you chose.

## Permissions

| Permission | Used for |
|---|---|
| `declarativeNetRequest` | Adding the URL parameters and request headers |
| `cookies` | Removing the `UULE` cookie |
| `storage` | Saving your places and settings |
| `alarms` | Refreshing the location data every 60 minutes |
| `*://*.google.com/*` | Changing Google requests only |
| `https://photon.komoot.io/*` | Finding places |

## Data

- Your places and settings stay in your browser.
- The text you type in the place search goes to [Photon](https://photon.komoot.io) (komoot) to find matching places.
- The extension sends no other data.

## Code style and build

- JavaScript follows the [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html), with JSDoc.
- HTML and CSS follow the [Google HTML/CSS Style Guide](https://google.github.io/styleguide/htmlcssguide.html).
- `npm run build` minifies JavaScript and CSS with esbuild and removes comments.

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## License

GPL-3.0. Copyright (C) 2026 GRAVANT LABS LLC. See [LICENSE](LICENSE).
