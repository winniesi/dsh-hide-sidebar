/**
 * Offline smoke check for the dsh-hide-sidebar browser half.
 *
 * Loads `client.js` exactly the way the client module loader does — through
 * `window.__ModuleLoader__.load` — then drives `apply()` with a stub context and
 * renders both seats with `react-dom/server`. It proves the registration shape,
 * the injected bridge, the pure track parser, the rendered markup and the
 * stylesheet's token discipline without a browser or a Harness boot.
 *
 * React is not a dependency of this package: the check borrows the copy the
 * browser page actually uses, from the installed profile. Set
 * `DSH_PROFILE_DIR` when the profile is not `$DSH_HOME/profiles/web`.
 *
 *   node test/smoke.mjs
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

/** Collected failures; the process exits non-zero when anything lands here. */
const failures = []
let checks = 0

const assert = (ok, label, detail) => {
  checks += 1
  if (ok) return
  failures.push(detail === undefined ? label : `${label}\n      ${detail}`)
}
const equal = (actual, expected, label) =>
  assert(
    Object.is(actual, expected),
    label,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  )

/** Locate the installed profile so React can be borrowed from it. */
function findProfile() {
  const candidates = [
    process.env.DSH_PROFILE_DIR,
    process.env.DSH_HOME === undefined ? undefined : join(process.env.DSH_HOME, 'profiles', 'web'),
    process.env.HOME === undefined ? undefined : join(process.env.HOME, '.dsh', 'profiles', 'web'),
  ].filter((value) => value !== undefined)
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'node_modules', 'react', 'package.json'))) return candidate
  }
  return undefined
}

const profile = findProfile()
if (profile === undefined) {
  console.error('smoke: no installed profile with React found; set DSH_PROFILE_DIR')
  process.exit(2)
}
const profileRequire = createRequire(join(profile, 'package.json'))
const React = profileRequire('react')
const { renderToStaticMarkup } = profileRequire('react-dom/server')

//#region load the bundle the way the browser does

let row
globalThis.window = {
  __ModuleLoader__: {
    load(candidate) {
      row = candidate
    },
  },
}
await import(new URL('../client.js', import.meta.url).href)
delete globalThis.window

equal(row === undefined ? undefined : row.id, 'dsh-hide-sidebar', 'the bundle registers under its package id')
const plugin = row.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require(${JSON.stringify(id)})`)
})

//#endregion

//#region apply() against a stub context

const dictionary = new Map()
const toggles = { count: 0 }
const styleTags = []
const injections = []
const ctx = {
  effect(fn, label) {
    const dispose = fn()
    return dispose
  },
  layout: {
    toggleSidebar() {
      toggles.count += 1
    },
  },
  locale: {
    register(namespace, dictionaries) {
      dictionary.set(namespace, dictionaries)
      return () => {}
    },
    bind: (namespace) => (key) => {
      const english = dictionary.get(namespace)?.en
      return english === undefined ? key : english[key]
    },
  },
  slots: {
    inject(name, contribute) {
      injections.push({ name, contribution: contribute() })
    },
    register(options, component) {
      return { options, component }
    },
  },
}

// The stylesheet is injected through `document`; give it just enough DOM.
globalThis.document = {
  querySelector: () => styleTags[0] ?? null,
  createElement: () => ({
    dataset: {},
    set textContent(value) {
      this.css = value
    },
    remove() {},
  }),
  head: {
    appendChild(tag) {
      styleTags.push(tag)
    },
  },
}

plugin.apply(ctx)
delete globalThis.document

assert(typeof plugin.apply === 'function', 'exports.apply is a function')
equal(
  JSON.stringify(plugin.inject),
  JSON.stringify(['slots', 'layout', 'locale']),
  'exports.inject declares the three services the plugin uses',
)
equal(styleTags.length, 1, 'apply injects exactly one stylesheet')
equal(
  injections.map((entry) => entry.name).join(','),
  'shell.overlay,conversation.header.leading',
  'apply claims the overlay seat and the Conversation header leading seat',
)
equal(dictionary.size, 1, 'apply registers one locale namespace')

const [overlay, leading] = injections
for (const entry of [overlay, leading]) {
  equal(entry.contribution.options.locale, 'dsh.hideSidebar', `${entry.name} binds the plugin dictionary`)
  const injected = entry.contribution.options.inject()
  assert(typeof injected.toggleSidebar === 'function', `${entry.name} injects toggleSidebar`)
  assert(injected.frameState !== undefined, `${entry.name} injects the frame bridge`)
  injected.toggleSidebar()
}
equal(toggles.count, 2, 'the injected toggleSidebar calls ctx.layout.toggleSidebar')

//#endregion

//#region render both seats

const t = ctx.locale.bind('dsh.hideSidebar')
const render = (entry) =>
  renderToStaticMarkup(
    React.createElement(entry.contribution.component, {
      ...entry.contribution.options.inject(),
      t,
    }),
  )

const overlayMarkup = render(overlay)
const leadingMarkup = render(leading)

assert(overlayMarkup.includes('dsh-hs-fab'), 'the overlay seat renders the floating toggle')
assert(overlayMarkup.includes('dsh-hs-scrim'), 'the overlay seat renders the scrim')
assert(overlayMarkup.includes('aria-label="Open sidebar"'), 'a collapsed drawer announces "Open sidebar"')
assert(overlayMarkup.includes('aria-expanded="false"'), 'a collapsed drawer reports aria-expanded=false')
assert(!overlayMarkup.includes('undefined'), 'no unresolved placeholder reaches the markup')
assert(leadingMarkup.includes('dsh-hs-leading'), 'the header seat renders the leading toggle')
assert(!leadingMarkup.includes('NaN'), 'no NaN reaches the markup')

//#endregion

//#region pure helpers

const { splitTracks, createFrameState, CSS, ATTR, DISMISS_SELECTORS, KEEP_OPEN_SELECTORS, ACTIVATE_SELECTORS } = plugin.__test

assert(DISMISS_SELECTORS.includes('[data-row-key^="session:"]'), 'the dismiss list hooks the session rows')
assert(DISMISS_SELECTORS.includes('button:has([data-slot="sidebar.panellist"])'), 'the dismiss list hooks the panel rows')
assert(DISMISS_SELECTORS.includes('button:has([data-slot="settings.trigger"])'), 'the dismiss list hooks the Settings trigger')
assert(KEEP_OPEN_SELECTORS.includes('[aria-expanded]'), 'menus and inline disclosures keep the drawer open')
assert(KEEP_OPEN_SELECTORS.includes('[aria-haspopup]'), 'popup triggers keep the drawer open')
assert(ACTIVATE_SELECTORS.includes('button'), 'the activation fallback covers buttons')

equal(splitTracks('56px minmax(0px, 1fr) minmax(0px, 0px)').length, 3, 'tracks split around nested parentheses')
equal(splitTracks('280px minmax(400px, 1fr) minmax(0px, 405px)')[0], '280px', 'the drawer track is the first one')
equal(splitTracks('280px minmax(400px, 1fr) minmax(0px, 405px)')[2], 'minmax(0px, 405px)', 'the right track is the third one')
equal(splitTracks('').length, 0, 'an empty track list yields nothing')
equal(splitTracks('minmax(0px, max-content)').length, 1, 'a single spaced track stays one track')

const state = createFrameState()
let notifications = 0
state.subscribe(() => {
  notifications += 1
})
state.set({ narrow: false, collapsed: true })
equal(notifications, 0, 'an unchanged snapshot does not notify')
state.set({ narrow: true, collapsed: true })
equal(notifications, 1, 'a changed snapshot notifies once')
equal(state.get().narrow, true, 'the snapshot carries the new state')
state.set({ narrow: true, collapsed: false })
equal(state.get().collapsed, false, 'the drawer state travels through the same snapshot')

//#endregion

//#region stylesheet discipline

assert(CSS.includes(`[${ATTR}]`), 'every layout rule is gated on the bridge attribute')
assert(!/#[0-9a-f]{3,8}\b/i.test(CSS), 'the stylesheet carries no literal hex colours')
assert(!/\b(?:rgba?|hsla?)\(/i.test(CSS), 'the stylesheet carries no literal functional colours')
assert(CSS.includes('grid-template-columns:0px minmax(0px,1fr)'), 'the rail track is zeroed in narrow mode')
assert(CSS.includes('position:absolute'), 'the sidebar column is taken out of the grid')
assert(CSS.includes('--dsw-elevation-prominent'), 'the drawer uses the design system elevation token')

/**
 * Locate the installed theme package so the stylesheet's tokens can be checked
 * against the ones the running app really publishes. Tries, in order: an
 * explicit override, the `dsh` executable on PATH (its own bundled
 * `node_modules`), and the global npm root.
 * @returns the theme bundle path, or undefined when dsh cannot be found.
 */
function findThemePackage() {
  const roots = []
  if (process.env.DSH_PACKAGES_DIR !== undefined) roots.push(process.env.DSH_PACKAGES_DIR)
  const executable = (process.env.PATH ?? '')
    .split(':')
    .map((entry) => join(entry, 'dsh'))
    .find((candidate) => existsSync(candidate))
  if (executable !== undefined) {
    try {
      roots.push(join(dirname(dirname(realpathSync(executable))), 'node_modules', '@deepseek-ai'))
    } catch {
      /* a broken symlink just means this candidate is unusable */
    }
  }
  for (const root of roots) {
    const theme = join(root, 'dsh-client-ui-theme', 'lib', 'client.js')
    if (existsSync(theme)) return theme
  }
  return undefined
}

const themeFile = findThemePackage()
if (themeFile === undefined) {
  console.log('smoke: theme package not found; skipped the token existence check')
} else {
  const themeSource = readFileSync(themeFile, 'utf8')
  const defined = new Set(themeSource.match(/--dsw-[a-z0-9-]+(?=\s*:)/g) ?? [])
  const used = new Set(CSS.match(/--dsw-[a-z0-9-]+/g) ?? [])
  const missing = [...used].filter((name) => !defined.has(name))
  equal(used.size > 6, true, 'the stylesheet uses the design system tokens')
  assert(missing.length === 0, 'every --dsw-* token the stylesheet uses exists in the theme', missing.join(', '))
}

//#endregion

if (failures.length > 0) {
  console.error(`\nsmoke: ${failures.length} of ${checks} checks failed\n`)
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}
console.log(`smoke: ${checks} checks passed`)
