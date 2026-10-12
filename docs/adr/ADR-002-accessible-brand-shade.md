# ADR-002: Accessible "brand-strong" shade for text and buttons

**Context.** Doc 13 requires WCAG 2.2 AA. Glacier Blue `#397FAF` reaches only **4.35:1** against white (AA for normal text needs 4.5:1).

**Decision.** Keep `#397FAF` as the signature color for large brand surfaces, focus rings and decoration. Add `brand-strong #2F6E99` (5.51:1 on white) for button fills and link text, and use `brand-deep #205477` for hover. Status colors have their own tokens (success `#067647`, warning `#B54708`, danger `#B42318`, each ≥ 5.4:1). Coral and amber stay decorative only.

**Tests.** Contrast ratios were computed during implementation. E2E checks layout at 320 and 360 px.
