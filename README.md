# MyWorkspace

A local-first, Confluence-like personal workspace. Plain HTML, CSS and vanilla JavaScript. No backend, no login.
All data lives in your browser's IndexedDB (existing LocalStorage data is migrated automatically; LocalStorage is only a fallback).

## Run it
Open `index.html` in a browser (works from disk), or serve the folder: `python3 -m http.server` and visit http://localhost:8000.

## Features
- Spaces, pages, tags, favorites, recent pages, search (titles, content, tags; `tag:name` filter)
- Markdown is the source of truth: the first `# Heading` is the page title
- Split Markdown + live preview editor with toolbar, list continuation, and autosave
- `[[Wiki links]]` between pages (a link to a missing page creates it when clicked)
- Import `.md` files, export a page as `.md`, export everything as a zip, JSON backup/restore (merge or replace)
- Profile (photo, title, about, location, links, interests), light/dark/system theme
- Responsive: sidebar on desktop, drawer on mobile, bottom action bar on phones

## Routes
`#/home` `#/pages` `#/page/:id` `#/page/:id/edit` `#/space/:id` `#/favorites` `#/recent` `#/profile` `#/settings` `#/search/:query`

## Layout
`css/` variables, layout, components, markdown, responsive. `js/` app, router, storageService, pageService,
searchService, markdownService, ui, utils, icons, and `components/` (header, sidebar, dashboard, pageList,
pageViewer, pageEditor, profile, settings). Libraries are vendored in `js/vendor/` (marked, DOMPurify, JSZip).

Scripts are plain (not ES modules) on a shared `WS` namespace so the app also runs from `file://`.
