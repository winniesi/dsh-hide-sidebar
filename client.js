/**
 * dsh-hide-sidebar browser half.
 *
 * On a narrow Web viewport ui-layout auto-collapses the left sidebar to a 56px
 * icon rail that stays on screen and eats a phone's width on every page. This
 * plugin replaces that rail with the standard mobile affordance: the sidebar
 * lives off canvas, and one button at the top of the frame slides it in over
 * the content, with a scrim to dismiss it.
 *
 * Why it is built this way:
 *
 * - **The frame stays in charge.** The drawer reuses ui-layout's own narrow
 *   toggle (`ctx.layout.toggleSidebar()` flips `narrowExpanded` below the
 *   1024px breakpoint) and reads ui-layout's own `data-sidebar-collapsed`
 *   attribute as its open/closed state. The plugin adds presentation only:
 *   it neither stores state nor re-implements the breakpoint.
 * - **Nothing is hidden until the panel is really narrow.** Every rule is gated
 *   on `html[data-dsh-hide-sidebar]`, an attribute the frame bridge sets from
 *   the frame's *measured* width against ui-layout's own 1024px threshold. A
 *   desktop window is byte-for-byte the shipped layout, and the collapsed
 *   desktop rail keeps working.
 * - **The sidebar tree is moved, not copied.** The grid keeps its three items —
 *   taking the sidebar column out of flow would shift the centre and right
 *   columns one track left — so only the sidebar's own root is positioned as
 *   the drawer. Its components, scroll containers and portals stay mounted and
 *   untouched: no second copy of the session list, no lost state.
 * - **The next column keeps its width.** The frame publishes its three tracks
 *   as an inline `grid-template-columns`; the bridge republishes the outer two
 *   as CSS variables, so overriding the track list to hide the rail preserves
 *   the right panel's docked width instead of forcing it over the content.
 * - **Two seats, one button.** The Conversation has a real header seat
 *   (`conversation.header.leading`), so the button costs no space there; every
 *   other main panel (plugin manager, schedules) has no leading seat, so the
 *   button floats in the frame's overlay layer and the panel reserves a left
 *   gutter for it.
 * - **Tapping through the drawer dismisses it.** A drawer that stays open after
 *   the reader picked a session hides the thing they just asked for, so a click
 *   inside it on a navigating control closes it — while menus and inline
 *   disclosures (session actions, search, Workspace groups) keep it open. The
 *   decision reads stable `data-row-key`/`data-slot` hooks plus `aria-expanded`
 *   and `aria-haspopup`, never a generated class name or a translated label.
 * - **Theme tokens only.** Colours, radii, elevation and the scrim all come from
 *   the `--dsw-*` design tokens, so light and dark both follow the app.
 *
 * Hand-authored bundle: no build step, so components use
 * `React.createElement` rather than JSX, and styling is one injected stylesheet
 * keyed on `.dsh-hs-`.
 */

window.__ModuleLoader__.load({
  id: 'dsh-hide-sidebar',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const module = { exports: {} }
    const exports = module.exports

    /** Locale namespace this plugin owns. */
    const NS = 'dsh.hideSidebar'
    /** Root attribute arming the whole stylesheet (set only while narrow). */
    const ATTR = 'data-dsh-hide-sidebar'
    /** The injected stylesheet's id, so a reload cannot stack copies. */
    const STYLE_ID = 'dsh-hide-sidebar/sidebar.css'
    /**
     * ui-layout's own auto-collapse breakpoint (`SIDEBAR_AUTO_COLLAPSE`). The
     * bridge measures the frame rather than the window so both halves of the
     * layout flip on exactly the same number, scrollbars included.
     */
    const NARROW_MAX = 1024
    /** Drawer width, republished from the frame's inline first grid track. */
    const DRAWER_VAR = '--dsh-hs-drawer'
    /** Right panel track, republished from the frame's inline third grid track. */
    const RIGHT_VAR = '--dsh-hs-right'

    /**
     * Controls whose use means "I am done with the sidebar": choosing a session
     * or a global panel, or opening Settings or a footer action. Every selector
     * here is a stable, unlocalized hook (`data-row-key`, `data-slot`), not a
     * generated class name or an aria label. The panel and Settings rows are
     * matched through the slot that sits *inside* their button, which is why
     * they read as `:has()`.
     */
    const DISMISS_SELECTORS = [
      '[data-row-key^="session:"]',
      'button:has([data-slot="sidebar.panellist"])',
      'button:has([data-slot="settings.trigger"])',
      '[data-slot="sidebar.footer.action"] button',
      '[data-slot="sidebar.footer.action"] [role="button"]',
    ].join(',')
    /**
     * Controls that open a menu or an inline disclosure — a session's actions,
     * the session search, the view options, a Workspace group row. They leave
     * the drawer open, because the thing they disclose lives inside it.
     */
    const KEEP_OPEN_SELECTORS = [
      '[aria-expanded]',
      '[aria-haspopup]',
      'input',
      'textarea',
      '[data-slot="sidebar.session.row.hover"]',
      '[data-slot^="sidebar.workspaces.session.row.action"]',
    ].join(',')
    /** Anything that activates: used when no explicit dismiss hook matched. */
    const ACTIVATE_SELECTORS = 'button,[role="button"],[role="treeitem"],a[href]'

    /** The stylesheet. See the module doc for why each rule is shaped this way. */
    const CSS = `
/* ---- shared button chrome, matching the shipped header icon buttons ---- */
/* Declared first: the two seat rules below set display, and a seat's own
   display:none must win over this shared inline-flex. */
.dsh-hs-button{display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:28px;height:28px;padding:0;border:none;border-radius:var(--dsw-radius-sm);
  background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-hs-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-hs-button:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}

/* ---- narrow mode only: everything below is gated on the bridge attribute ---- */

/* The rail's 56px track is gone: the grid keeps the centre and the right
   panel's own width. */
[${ATTR}] [data-slot="root"] > div{grid-template-columns:0px minmax(0px,1fr) var(${RIGHT_VAR},0px)!important}

/* The sidebar column stays a grid item — taking it out of flow would shift
   every later column one track left — and only becomes a containing block.
   Its 0px track clips nothing because the overflow moves out to the frame,
   which is already hidden. */
[${ATTR}] [data-slot="root"] > div > div:has(> [data-slot="sidebar"]){position:relative;overflow:visible}
/* The sidebar itself becomes the off-canvas drawer. It stays mounted, so the
   session tree, dialogs and scroll positions survive opening and closing. */
[${ATTR}] [data-slot="root"] > div > div:has(> [data-slot="sidebar"]) > [data-slot="sidebar"] > *{
  position:absolute;inset:0 auto 0 0;width:min(86vw,var(${DRAWER_VAR},280px));z-index:30;
  transform:translateX(-101%);transition:transform .26s var(--ds-ease-in-out);will-change:transform}
[${ATTR}] [data-slot="root"] > div:not([data-sidebar-collapsed]) > div:has(> [data-slot="sidebar"]) > [data-slot="sidebar"] > *{
  transform:none;box-shadow:var(--dsw-elevation-prominent)}

/* A col-resize handle belongs to a docked column, not to a drawer: on touch it
   would swallow the drags that scroll the page under it. */
[${ATTR}] [data-slot="root"] > div > [data-side="sidebar"]{display:none}

/* Scrim: the app's own modal mask, so it matches dialogs in both themes. */
.dsh-hs-scrim{position:absolute;inset:0;z-index:20;display:none;pointer-events:auto;
  background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}
[${ATTR}] [data-slot="root"] > div:not([data-sidebar-collapsed]) .dsh-hs-scrim{display:block}
[${ATTR}] [data-slot="root"] > div:not([data-rightbar-collapsed]) .dsh-hs-scrim{display:none}

/* Floating toggle: the seat for main panels that have no header leading slot.
   It only shows with the rail closed and no right panel over the frame, and
   never beside the Conversation, which uses its header seat instead. */
.dsh-hs-fab{position:absolute;top:8px;left:8px;z-index:21;display:none;pointer-events:auto;
  width:28px;height:28px;padding:0;border:.5px solid var(--dsw-alias-border-l3);
  border-radius:var(--dsw-radius-md);background:var(--dsw-alias-button-elevated-fill);
  color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel);cursor:pointer;
  align-items:center;justify-content:center}
.dsh-hs-fab:hover{background:var(--dsw-alias-button-floating-hover)}
[${ATTR}] [data-slot="root"] > div[data-sidebar-collapsed][data-rightbar-collapsed]:not(:has([data-slot="main.conversation"])) .dsh-hs-fab{display:inline-flex}

/* Reserve the floating toggle's gutter inside the panel while the main column
   is not showing the Conversation. A panel's root is a direct child of the main
   slot, while the Conversation's own entry is a display:contents wrapper, so
   the condition is read from the slot instead of from the child. A transparent
   border adds to whatever padding the panel already declares. */
[${ATTR}] [data-slot="main"]:not(:has([data-slot="main.conversation"])) > *{border-left:40px solid transparent}

/* Header seat (Conversation): hidden on every wide viewport, where the rail
   already carries a toggle. */
.dsh-hs-leading{display:none}
[${ATTR}] .dsh-hs-leading{display:inline-flex}
`

    /** Chinese dictionary, checked complete against the English key set. */
    const zh = {
      open: '打开侧边栏',
      close: '收起侧边栏',
    }
    /** English dictionary. */
    const en = {
      open: 'Open sidebar',
      close: 'Collapse sidebar',
    }

    //#region pure helpers

    /**
     * Split a `grid-template-columns` track list on top-level whitespace.
     *
     * Tracks are space separated, but a track may itself contain spaces
     * (`minmax(0px, 1fr)`), so parentheses depth decides where one ends.
     * @param value - the frame's inline track list.
     * @returns the tracks, or an empty array when the value is not a track list.
     */
    function splitTracks(value) {
      const tracks = []
      let depth = 0
      let current = ''
      for (const char of value) {
        if (char === '(') depth += 1
        else if (char === ')') depth -= 1
        if (depth === 0 && (char === ' ' || char === '\t' || char === '\n')) {
          if (current !== '') tracks.push(current)
          current = ''
          continue
        }
        current += char
      }
      if (current !== '') tracks.push(current)
      return tracks
    }

    /**
     * Read the frame's three tracks and publish the outer two as CSS variables.
     *
     * The drawer width must follow the sidebar's real width (264–420px, set by
     * a drag) and the right track must survive the rail override, so both are
     * taken from the layout's own output instead of being recomputed here.
     * Existing equal values are left alone: a write would re-enter the style
     * observer that called this.
     * @param frame - the AppFrame element.
     */
    function publishTracks(frame) {
      const tracks = splitTracks(frame.style.getPropertyValue('grid-template-columns'))
      if (tracks.length !== 3) return
      for (const [name, value] of [
        [DRAWER_VAR, tracks[0]],
        [RIGHT_VAR, tracks[2]],
      ]) {
        if (frame.style.getPropertyValue(name) !== value) frame.style.setProperty(name, value)
      }
    }

    //#endregion

    //#region frame bridge

    /**
     * The narrow/collapsed state both toggle seats render against.
     *
     * The frame's own DOM is the source of truth — ui-layout's
     * `data-sidebar-collapsed` attribute plus its measured width — so the
     * plugin needs no store share and can never disagree with the layout about
     * which mode it is in. `useSyncExternalStore` needs a stable snapshot, so
     * the state object is replaced only when a field really changes.
     * @returns a small observable with `set`, `get` and `subscribe`.
     */
    function createFrameState() {
      let snapshot = { narrow: false, collapsed: true }
      const listeners = new Set()
      return {
        get: () => snapshot,
        set(next) {
          if (next.narrow === snapshot.narrow && next.collapsed === snapshot.collapsed) return
          snapshot = { narrow: next.narrow, collapsed: next.collapsed }
          for (const listener of listeners) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      }
    }

    /** Subscribe a component to the frame bridge. */
    function useFrameState(frameState) {
      return React.useSyncExternalStore(frameState.subscribe, frameState.get, frameState.get)
    }

    /**
     * Keep the root attribute, the published tracks and the shared state in
     * step with the frame for as long as this plugin is loaded, and dismiss the
     * open drawer when the reader navigates from inside it.
     * @param nodeRef - ref to the occupant's own node, used to find the frame.
     * @param frameState - state published to both toggle seats.
     * @param toggleRef - ref holding the injected toggle, so a re-render never
     *   re-subscribes the observers.
     * @returns the effect cleanup that disarms the stylesheet.
     */
    function useFrameBridge(nodeRef, frameState, toggleRef) {
      // `useLayoutEffect` so the first paint after the frame mounts is already
      // in narrow mode; the server-render fallback keeps the offline check calm.
      const useBridge = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect
      useBridge(() => {
        const node = nodeRef.current
        const root = node === null || node === undefined ? null : node.closest('[data-slot="root"]')
        const frame = root === null ? null : root.firstElementChild
        if (!(frame instanceof HTMLElement)) return undefined
        const html = document.documentElement
        const sync = () => {
          publishTracks(frame)
          const narrow = frame.getBoundingClientRect().width < NARROW_MAX
          if (narrow) html.setAttribute(ATTR, '')
          else html.removeAttribute(ATTR)
          frameState.set({ narrow, collapsed: frame.hasAttribute('data-sidebar-collapsed') })
        }
        /**
         * A tap inside the open drawer that navigates closes the drawer.
         *
         * The listener is delegated on the document — re-reading the drawer each
         * time, so the sidebar's own re-renders cannot strand it — and runs in
         * the capture phase, so a control that stops its own propagation still
         * counts. The close itself is deferred by one frame and re-checks the
         * state first: the sidebar's own collapse control toggles the same layout
         * flag, and a second toggle in the same click would cancel it out.
         * Deferring makes this a fallback for controls that navigate without
         * closing, never a competitor to one that already closed the drawer.
         */
        const onDocumentClick = (event) => {
          const { narrow, collapsed } = frameState.get()
          if (!narrow || collapsed) return
          const drawer = frame.querySelector('[data-slot="sidebar"] > *')
          if (drawer === null) return
          const target = event.target
          if (!(target instanceof Element) || !drawer.contains(target)) return
          const dismiss = target.closest(DISMISS_SELECTORS) !== null
          const keepOpen = target.closest(KEEP_OPEN_SELECTORS) !== null
          const activates = target.closest(ACTIVATE_SELECTORS) !== null
          if (!dismiss && !(activates && !keepOpen)) return
          requestAnimationFrame(() => {
            const state = frameState.get()
            if (state.narrow && !state.collapsed) toggleRef.current()
          })
        }
        const resize = new ResizeObserver(sync)
        resize.observe(frame)
        const mutation = new MutationObserver(sync)
        mutation.observe(frame, { attributes: true, attributeFilter: ['style', 'data-sidebar-collapsed'] })
        document.addEventListener('click', onDocumentClick, true)
        sync()
        return () => {
          resize.disconnect()
          mutation.disconnect()
          document.removeEventListener('click', onDocumentClick, true)
          html.removeAttribute(ATTR)
          frameState.set({ narrow: false, collapsed: true })
        }
      }, [nodeRef, frameState, toggleRef])
    }

    //#endregion

    //#region components

    /**
     * The shipped panel glyph, verbatim.
     *
     * This is `IconPanelLeftOutlineRegular` from
     * `@deepseek-ai/dsh-client-ui-primitives` — the artwork the top-right "open
     * right sidebar" control draws after mirroring it with `scaleX(-1)`, and the
     * one ui-sidebar's own open control uses as-is. Taking it unmirrored is
     * exactly "that top-right icon turned 180 degrees", so the two controls read
     * as one family.
     *
     * Copied rather than imported on purpose: a profile-installed plugin must
     * not depend on dsh's own packages, and a failed `require` here would take
     * the whole Web boot down with it. `test/smoke.mjs` re-reads the installed
     * primitives bundle and fails if this copy drifts from upstream.
     */
    const PANEL_ICON = {
      viewBox: '0 0 16 16',
      strokeWidth: 1,
      /** Outer rounded frame. */
      frame:
        'M13.5 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z',
      /** The divider rail, on the left here. */
      divider: 'M5.5 1.5V14.5',
    }

    /** Draw the panel glyph at the shipped metrics (16px, 1px stroke). */
    function PanelIcon({ size }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: PANEL_ICON.viewBox,
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': 'true',
          strokeWidth: PANEL_ICON.strokeWidth,
        },
        h('path', { d: PANEL_ICON.frame, stroke: 'currentColor' }),
        h('path', { d: PANEL_ICON.divider, stroke: 'currentColor' }),
      )
    }

    /**
     * One sidebar toggle. `aria-expanded` tracks the live drawer state, so the
     * control announces what it will do even though the label is stable.
     */
    function ToggleButton({ className, label, expanded, onClick }) {
      return h(
        'button',
        {
          type: 'button',
          className: className === undefined ? 'dsh-hs-button' : `dsh-hs-button ${className}`,
          'aria-label': label,
          'aria-expanded': expanded,
          title: label,
          onClick,
        },
        h(PanelIcon, { size: 16 }),
      )
    }

    /**
     * Frame-level seat: the scrim plus the floating toggle for main panels
     * without a header leading seat. Also owns the frame bridge, because the
     * overlay slot is mounted on every page while the header seat is not.
     */
    function FrameControls({ toggleSidebar, frameState, t }) {
      const nodeRef = React.useRef(null)
      const toggleRef = React.useRef(toggleSidebar)
      toggleRef.current = toggleSidebar
      const { collapsed } = useFrameState(frameState)
      useFrameBridge(nodeRef, frameState, toggleRef)
      const label = collapsed ? t('open') : t('close')
      return h(
        React.Fragment,
        null,
        h('div', {
          ref: nodeRef,
          className: 'dsh-hs-scrim',
          'aria-hidden': 'true',
          onClick: toggleSidebar,
        }),
        h(ToggleButton, {
          className: 'dsh-hs-fab',
          label,
          expanded: !collapsed,
          onClick: toggleSidebar,
        }),
      )
    }

    /** Conversation header seat: the same toggle, in the header's leading cell. */
    function HeaderLeadingToggle({ toggleSidebar, frameState, t }) {
      const { collapsed } = useFrameState(frameState)
      const label = collapsed ? t('open') : t('close')
      return h(ToggleButton, {
        className: 'dsh-hs-leading',
        label,
        expanded: !collapsed,
        onClick: toggleSidebar,
      })
    }

    //#endregion

    /**
     * Inject the stylesheet once.
     * @returns a disposer removing this effect's own tag.
     */
    function ensureStyles() {
      if (typeof document === 'undefined') return undefined
      const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`
      if (document.querySelector(selector) !== null) return undefined
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-hide-sidebar'
      tag.dataset.pluginCss = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    /**
     * Register the plugin: dictionaries, the injected frame bridge, and the two
     * toggle seats.
     * @param ctx - client plugin context.
     */
    function apply(ctx) {
      ctx.effect(ensureStyles, 'hide-sidebar: stylesheet')
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'hide-sidebar: dictionaries')
      const frameState = createFrameState()
      const injectProps = () => ({
        toggleSidebar: () => {
          ctx.layout.toggleSidebar()
        },
        frameState,
      })
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            // `shell.overlay` is a list slot: every entry carries the id that
            // keys it, so a second contribution could sit beside this one.
            id: 'dsh-hide-sidebar',
            locale: NS,
            inject: injectProps,
          },
          FrameControls,
        ),
      )
      ctx.slots.inject('conversation.header.leading', () =>
        ctx.slots.register(
          {
            name: 'conversation.header.leading',
            locale: NS,
            inject: injectProps,
          },
          HeaderLeadingToggle,
        ),
      )
    }

    exports.apply = apply
    exports.inject = ['slots', 'layout', 'locale']
    /**
     * Rendering seam for the offline check: the pure helpers and both
     * components, so the registration and the markup can be exercised without
     * a browser, a Harness boot or the real layout.
     */
    exports.__test = {
      CSS,
      ATTR,
      NS,
      DISMISS_SELECTORS,
      KEEP_OPEN_SELECTORS,
      ACTIVATE_SELECTORS,
      PANEL_ICON,
      splitTracks,
      createFrameState,
      FrameControls,
      HeaderLeadingToggle,
      ToggleButton,
    }
    return module.exports
  },
})
