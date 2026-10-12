# 13 | HelloEventHub brand and design system

## Working identity
Name: **HelloEventHub**. Domain: `helloeventhub.online`. Tagline: **Plan. Register. Connect.** Visual personality: modern, welcoming, celebratory and professional. First event branding is subordinate to the platform identity.

## Colors
| Token | Hex | Use |
|---|---|---|
| `brand.primary` | `#397FAF` | Signature Glacier Blue, primary interactive actions |
| `brand.deep` | `#205477` | Primary hover, dark contrast areas |
| `brand.sky` | `#69A9D1` | Highlights and ribbons |
| `brand.ice` | `#E8F3FA` | Gentle backgrounds |
| `brand.coral` | `#F28B78` | Small celebration accents, not error state |
| `brand.amber` | `#F0BE62` | Small celebration accents, not warning state |
| `ink` | `#243348` | Primary text |
| `canvas` | `#F7FAFD` | Page background |
Use white surfaces and adequate contrast. Verify WCAG 2.2 AA for text and interactive states before final UI implementation; avoid blindly using a decorative accent for text. Feedback colors (success/warning/error) need independent accessible tokens.

## Logo direction selected
**Celebration Pine:** custom pine tree silhouette built from playful connected flowing strokes, with subtle HEH integration and small coral/amber nodes; Glacier Blue dominant. Balanced complexity should express fun, community and connection. Wordmark: `Hello` in Glacier Blue + `EventHub` in slate ink. A placeholder pine icon is not the approved custom logo artwork. Do not claim design uniqueness or trademark clearance without review. Logo assets should eventually have horizontal, stacked, mark-only, monochrome and small-size simplified versions.

## Fonts and interface
Headings: Plus Jakarta Sans; body: Inter; system fallbacks and licensed web fonts only. Use accessible line-height and consistent scale. Corners 10–14 px, subtle borders, restrained shadows. Lucide outlines for controls. Large button targets and forms, prominent error/connection states. Dark mode not critical for Oct P0; light theme first.

## Public pages vs dashboard
Public event page may show tasteful celebratory accents and event-specific banner. Admin/committee uses quiet surfaces, strong labels, compact tables, consistent chart legends and very obvious network status. Do not treat all blue badges as meaning the same status.

## App icons and email
Keep brand icon simple at 16/32 px; PWA icons must have accessible safe margins. Transactional emails should share brand color but prioritize readable content. Generated report styling is subordinate to clarity and privacy.
