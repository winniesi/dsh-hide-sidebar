/**
 * dsh-hide-sidebar host half.
 *
 * The whole plugin is browser-side: it moves the left sidebar off canvas on
 * narrow viewports and gives the frame a toggle button in its place. Nothing
 * here reaches the model, the filesystem, or the Connection transport, so this
 * half exists only because a Loader row must resolve to a plugin — the client
 * bundle is reached through `package.json`'s `dsh.client` declaration, not
 * through this module.
 *
 * @module dsh-hide-sidebar
 */

/** Plugin name shown in the Loader inventory. */
export const name = 'dsh-hide-sidebar'

/** No services: the host half owns no state. */
export const inject = []

/** No host-side behavior; the browser half does the work. */
export function apply() {}
