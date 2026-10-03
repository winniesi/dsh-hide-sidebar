/**
 * Live browser check for dsh-hide-sidebar.
 *
 * Drives the running Harness Web GUI through Playwright and asserts the mobile
 * drawer's contract in a real page: the rail is off canvas, exactly one toggle
 * seat is reachable, the drawer opens over the content, navigating dismisses
 * it, and a wide viewport is byte-for-byte the shipped layout.
 *
 * Not part of `npm test`: it needs a running dsh Web server, an authenticated
 * URL, and Playwright. Point it at the page you are looking at:
 *
 *   DSH_URL="http://127.0.0.1:3080/?token=…" \
 *     NODE_PATH="$(npm root -g)" node test/live-browser.mjs
 *
 * Without `DSH_URL` it falls back to `$DSH_HOME/last-web-url.txt`, which may
 * hold a stale token after a restart. Screenshots land in `test/artifacts/`.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const artifacts = join(here, 'artifacts')

const dshHome = process.env.DSH_HOME ?? (process.env.HOME === undefined ? undefined : join(process.env.HOME, '.dsh'))
const url =
  process.env.DSH_URL ??
  (dshHome !== undefined && existsSync(join(dshHome, 'last-web-url.txt'))
    ? readFileSync(join(dshHome, 'last-web-url.txt'), 'utf8').trim()
    : undefined)
if (url === undefined || url === '') {
  console.error('live-browser: set DSH_URL to the authenticated Web GUI URL')
  process.exit(2)
}

const playwrightPath = process.env.PLAYWRIGHT_PATH ?? '/home/winniesi/.local/share/mise/installs/npm-playwright/latest/node_modules/'
const require = createRequire(join(playwrightPath, 'noop.js'))
const { chromium } = require('playwright')

mkdirSync(artifacts, { recursive: true })

const failures = []
let checks = 0
const assert = (ok, label, detail) => {
  checks += 1
  if (!ok) failures.push(detail === undefined ? label : `${label}\n      ${detail}`)
}

/** Read everything the assertions need out of the live frame. */
const probe = (page) =>
  page.evaluate(() => {
    const frame = document.querySelector('[data-slot="root"] > div')
    const sidebarRoot = document.querySelector('[data-slot="sidebar"] > *')
    const rect = (el) => {
      if (el === null) return null
      const box = el.getBoundingClientRect()
      return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) }
    }
    const style = (el) => (el === null ? null : getComputedStyle(el))
    const fab = document.querySelector('.dsh-hs-fab')
    const leading = document.querySelector('.dsh-hs-leading')
    const scrim = document.querySelector('.dsh-hs-scrim')
    const panelRoot = document.querySelector('[data-slot="main"] > *')
    return {
      armed: document.documentElement.hasAttribute('data-dsh-hide-sidebar'),
      collapsed: frame?.hasAttribute('data-sidebar-collapsed') ?? null,
      inlineTracks: frame?.style.getPropertyValue('grid-template-columns') ?? null,
      computedTracks: frame === null ? null : style(frame).gridTemplateColumns,
      drawerVar: frame?.style.getPropertyValue('--dsh-hs-drawer') ?? null,
      drawer: rect(sidebarRoot),
      fab: fab === null ? null : { ...rect(fab), display: style(fab).display },
      leading: leading === null ? null : { ...rect(leading), display: style(leading).display },
      scrim: scrim === null ? null : { ...rect(scrim), display: style(scrim).display },
      panelSlot: document.querySelector('[data-slot="main"]')?.getAttribute('data-slot') ?? null,
      panelRootBorderLeft: panelRoot === null ? null : style(panelRoot).borderLeftWidth,
      conversationShown: document.querySelector('[data-slot="main.conversation"]') !== null,
    }
  })

const visible = (seat) => seat !== null && seat.display !== 'none' && seat.w > 0

/** Open a page, dismiss the first-run notice, and let the plugin arm itself. */
async function open(browser, width, height) {
  const page = await browser.newPage({
    viewport: { width, height },
    isMobile: width < 1024,
    hasTouch: width < 1024,
    deviceScaleFactor: 2,
  })
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  const notice = page.getByRole('button', { name: /continue/i }).first()
  if (await notice.count()) {
    await notice.click()
    await page.waitForTimeout(600)
  }
  await page.waitForTimeout(1500)
  return { page, errors }
}

const browser = await chromium.launch()

//#region mobile: the Conversation
{
  const { page, errors } = await open(browser, 390, 844)
  assert(
    !errors.some((text) => /did not activate|dsh-hide-sidebar: failed/.test(text)),
    'the plugin activates without a boot failure',
    errors.join(' | ').slice(0, 300),
  )

  const collapsed = await probe(page)
  assert(collapsed.armed, 'the root attribute arms narrow mode')
  assert(collapsed.computedTracks.startsWith('0px'), 'the rail track is zeroed while the inline style still asks for 56px', collapsed.computedTracks)
  assert(collapsed.inlineTracks?.startsWith('56px') === true, 'the layout still publishes its own 56px rail track', collapsed.inlineTracks)
  assert(collapsed.drawer !== null && collapsed.drawer.x + collapsed.drawer.w <= 1, 'the sidebar sits off canvas while closed', JSON.stringify(collapsed.drawer))
  assert(visible(collapsed.leading), 'the Conversation seat renders the toggle in its header')
  assert(!visible(collapsed.fab), 'the floating toggle stays hidden while the Conversation is shown')
  assert(collapsed.scrim?.display === 'none', 'no scrim while the drawer is closed')
  await page.screenshot({ path: join(artifacts, 'mobile-conversation.png') })

  // Open it from the header seat, the way a reader would.
  await page.locator('.dsh-hs-leading').click()
  await page.waitForTimeout(700)
  const opened = await probe(page)
  assert(opened.collapsed === false, 'tapping the header toggle opens the drawer')
  assert(opened.drawer !== null && opened.drawer.x === 0 && opened.drawer.w >= 264, 'the open drawer is anchored to the left edge at its real width', JSON.stringify(opened.drawer))
  assert(opened.drawerVar !== null && opened.drawerVar !== '56px', 'the drawer width follows the layout track', String(opened.drawerVar))
  assert(opened.scrim?.display === 'block' && opened.scrim.w >= 380, 'the scrim covers the frame while the drawer is open', JSON.stringify(opened.scrim))
  await page.screenshot({ path: join(artifacts, 'mobile-drawer-open.png') })

  // The sidebar's own collapse control must close it.
  await page.locator('[data-slot="sidebar"] button[aria-label="Collapse sidebar"]').first().click()
  await page.waitForTimeout(700)
  assert((await probe(page)).collapsed === true, 'the sidebar own collapse control closes the drawer')

  // A session row navigates, so it must dismiss the drawer.
  await page.locator('.dsh-hs-leading').click()
  await page.waitForTimeout(700)
  const row = page.locator('[data-row-key^="session:"]').first()
  assert((await row.count()) > 0, 'the drawer lists session rows')
  if ((await row.count()) > 0) {
    await row.click()
    await page.waitForTimeout(900)
    assert((await probe(page)).collapsed === true, 'picking a session dismisses the drawer')
  }
  assert(errors.length === 0, 'the mobile Conversation session logs no errors', errors.join(' | ').slice(0, 300))
  await page.close()
}

//#region mobile: a global panel
{
  const { page, errors } = await open(browser, 390, 844)
  await page.locator('.dsh-hs-leading').click()
  await page.waitForTimeout(700)
  const panelRow = page.locator('nav[aria-label] button').first()
  assert((await panelRow.count()) > 0, 'the drawer lists global panel rows')
  if ((await panelRow.count()) > 0) {
    await panelRow.click()
    await page.waitForTimeout(1300)
    const onPanel = await probe(page)
    assert(onPanel.conversationShown === false, 'the global panel owns the main column')
    assert(!visible(onPanel.leading), 'the Conversation seat is gone on a global panel')
    assert(visible(onPanel.fab), 'the floating toggle appears on a global panel')
    assert(onPanel.collapsed === true, 'picking a panel dismisses the drawer')
    assert(onPanel.panelRootBorderLeft === '40px', 'the panel reserves the floating toggle gutter', String(onPanel.panelRootBorderLeft))
    await page.screenshot({ path: join(artifacts, 'mobile-panel.png') })

    await page.locator('.dsh-hs-fab').click()
    await page.waitForTimeout(700)
    assert((await probe(page)).collapsed === false, 'the floating toggle opens the drawer')
    await page.mouse.click(360, 500)
    await page.waitForTimeout(700)
    assert((await probe(page)).collapsed === true, 'tapping the scrim dismisses the drawer')
    assert(errors.length === 0, 'the mobile panel session logs no errors', errors.join(' | ').slice(0, 300))
  }
  await page.close()
}

//#region wide: the shipped layout
{
  const { page, errors } = await open(browser, 1440, 900)
  const wide = await probe(page)
  assert(wide.armed === false, 'a wide viewport never arms the plugin')
  assert(wide.fab !== null && !visible(wide.fab), 'no floating toggle on a wide viewport')
  assert(wide.leading !== null && !visible(wide.leading), 'no header toggle on a wide viewport')
  assert(wide.computedTracks.startsWith('280px'), 'the docked sidebar keeps its shipped width', wide.computedTracks)
  assert(wide.panelRootBorderLeft !== '40px', 'no reserved gutter on a wide viewport', String(wide.panelRootBorderLeft))
  assert(errors.length === 0, 'the wide session logs no errors', errors.join(' | ').slice(0, 300))
  await page.screenshot({ path: join(artifacts, 'desktop.png') })
  await page.close()
}

await browser.close()

if (failures.length > 0) {
  console.error(`\nlive-browser: ${failures.length} of ${checks} checks failed\n`)
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}
console.log(`live-browser: ${checks} checks passed; screenshots in test/artifacts/`)
