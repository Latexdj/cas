# Website Module — Regression Checklist

This is the minimum regression checklist for every future change to the
Website module (Phase 1: Pages + Navigation, and every phase after it).
Run `npm run test:website` for the automated portion before merging any
change that touches `backend/src/routes/website.js`,
`admin-website-pages.js`, `admin-website-menu.js`, `backend/src/utils/
websiteValidation.js`, or `admin-portal/app/site/**`, `admin-portal/
components/site/**`.

## Security

- [ ] Tenant isolation: School A cannot read/update/delete/duplicate School
      B's pages or menu items, by ID manipulation or otherwise.
- [ ] A `page_id`/`parent_id` supplied in a menu-item request is rejected
      unless it belongs to the caller's own school.
- [ ] Every `website_pages`/`website_menu_items` query filters by
      `school_id` (or joins through a row that's already been
      tenant-verified) — no exceptions.
- [ ] `adminOnly` + `checkModuleAccess('website')` guard every admin
      endpoint; verified via **direct API calls** with real JWTs for
      teacher, student, and principal/management roles, not just by
      checking the UI hides the buttons.
- [ ] Unauthenticated requests get 401, not a silent empty response.
- [ ] XSS battery passes through the actual API (not just the editor UI):
      `<script>`, `onerror`/`onclick` attributes, `javascript:`/`data:`
      hrefs, `<iframe>`, `<svg onload>`, `<object>`/`<embed>`, malformed
      HTML — all neutralized server-side, confirmed by inspecting the
      stored row, not just the response.
- [ ] `external_url` on a menu item only accepts `#anchor`,
      `/relative-path`, or `http(s)://` — `javascript:`/`data:`/`vbscript:`
      rejected server-side.
- [ ] Page/menu-label/SEO text fields reject oversized input server-side
      (not just a frontend `maxlength`) while comfortably fitting real
      school names and content.
- [ ] Error responses never leak a stack trace, raw SQL, a file path, or
      an internal env var — confirmed via a malformed UUID, a malformed
      JSON body, and a forced DB error.

## Pages

- [ ] Create: required fields enforced, tenant assigned from
      `req.schoolId` (never client-supplied), slug normalized to a safe
      ASCII string (accents/Unicode/punctuation/spaces handled, not
      rejected outright).
- [ ] Read: list and single-page fetch both scoped by school; another
      school's page is a 404, not an empty object.
- [ ] Update: slug/title/content/SEO/status changes all persist; the
      homepage's slug is protected from being changed via PATCH even by a
      direct API call, not just a disabled form field.
- [ ] Delete: hard delete; the homepage cannot be deleted (DB-level
      `is_homepage = false` guard, not just an app-layer check); deleting
      a page that's linked from a menu removes that menu item (no broken
      public link left behind).
- [ ] Duplicate: new id, new (non-colliding) slug, correct tenant, content
      copied verbatim — **always starts as `draft`**, even when the
      source page was published.
- [ ] Draft pages never appear through the public API or public routes,
      at every stage: freshly created, previously published-then-reverted,
      direct URL, and the public menu listing.

## Navigation

- [ ] Create/update/delete all tenant-scoped the same way pages are.
- [ ] Reordering (`sort_order` swap) persists and reflects correctly
      after a refresh.
- [ ] **One level of nesting only**, enforced server-side in both
      directions:
  - [ ] Creating a child under an already-nested item (grandchild) → 4xx.
  - [ ] Re-parenting an existing top-level item under an already-nested
        item → 4xx.
  - [ ] Re-parenting an item that itself already has children (would
        create an indirect grandchild) → 4xx.
  - [ ] A menu item cannot be set as its own parent (prevents a circular
        tree that crashes `JSON.stringify` on the next `GET`).
- [ ] Deleting a parent **demotes its children to top-level** — it must
      not destroy them (`parent_id` is `ON DELETE SET NULL`, not
      `CASCADE`).
- [ ] Two menu items that happen to resolve to the same href (legitimate:
      nothing stops two items both pointing at `#academics`) don't break
      list rendering on the public site — keyed by the menu item's own
      id, not its resolved href.

## Public

- [ ] `/site/<slug>` and `/site/<slug>/<page>` routing: valid/invalid
      school, valid/invalid/draft/deleted page, malformed slug, special
      characters, trailing slash — correct status codes, never a stack
      trace.
- [ ] A school with **zero** `website_pages`/`website_menu_items` rows
      (never ran "generate starter") still renders via the old
      hardcoded-anchor fallback nav with no console errors — this is the
      permanent backward-compatibility contract for pre-migration sites,
      not a temporary shim.
- [ ] No duplicate/competing navigation system: grep for stray
      `navLinks =` definitions and old inline header/footer JSX outside
      `SiteChrome.tsx` and its documented fallback arrays.
- [ ] Responsive layout at 320 / 375 / 414 / 768 / 1024 / 1440px: no
      horizontal page scroll, no nav items clipped out of reach (a school
      with many menu items must get a scrollable nav, not silently lose
      items), mobile menu opens/closes correctly, footer intact.
- [ ] Header contrast: homepage (dark hero, unscrolled) gets light nav
      text; every other page (no hero, white background) gets dark nav
      text — verified by computed color, not just eyeballing a
      screenshot, and **not** by hardcoding one school's colors (must
      hold for any school's branding).

## Build

- [ ] `npm run test:website` (backend) — all green.
- [ ] `npm test` (admin-portal).
- [ ] `npx tsc --noEmit` (admin-portal) — clean.
- [ ] `npm run lint` (admin-portal) — no *new* errors in touched files
      (the pre-existing codebase-wide `react-hooks/set-state-in-effect`
      warnings on the established `useEffect(() => { load() }, [load])`
      data-fetching pattern are not Website-specific and are not a gate).
- [ ] `npm run build` (admin-portal) — exits 0, `/site/[slug]`,
      `/site/[slug]/[page]`, and every `/website/*` admin route compile.

## Known, deliberately out-of-scope items (do not re-litigate per change)

- SSR / `generateMetadata` / sitemap.xml — scheduled for the next phase;
  public pages are intentionally still `'use client'`.
- A full axe-core/WCAG automated audit — only heading hierarchy, alt
  text, keyboard reachability, visible focus, and accessible names are
  covered today.
- True concurrent-edit/race-condition protection — `sort_order` reorder
  is last-write-wins, an accepted risk at current team-per-school scale.
