# Design System: ShipRepo

## 1. Visual Theme & Atmosphere

ShipRepo is a high-trust cloud deployment workbench, not a marketing site and not a generic AI chat console. The interface should feel like a calm control room for turning a GitHub repository into a runnable Sealos application: precise, quiet, operational, and focused on the path from repository selection to deployment readiness.

Use a Daily App Balanced density level of 6, Offset Asymmetric variance level of 6, and Fluid CSS motion level of 5. Screens should feel composed and deliberate, with enough density for repeated engineering work but enough air that task state, repository identity, and deployment actions remain easy to scan.

The first viewport should make the product purpose immediately clear: choose a repository, invoke the fixed Sealos deployment path, then watch analysis, fixes, preview, and shipping progress. Preserve the narrow product contract around `/sealos-deploy`; do not turn the UI into a broad lifecycle dashboard or generic coding playground.

## 2. Color Palette & Roles

- **Sealos Canvas** (#FAFAFA) — Primary application background, full-page surfaces, and quiet empty areas.
- **Panel White** (#FFFFFF) — Command surfaces, dialogs, repository selectors, and high-priority workspace panels.
- **Charcoal Command** (#18181B) — Primary text, action labels, and strong hierarchy. Never use pure black.
- **Graphite Body** (#3F3F46) — Secondary headings, dense panel text, and explanatory copy.
- **Muted Zinc** (#71717A) — Helper text, metadata, timestamps, disabled states, and secondary navigation.
- **Hairline Zinc** (#E4E4E7) — Borders, panel dividers, tab rails, and low-contrast structure.
- **Soft Zinc Wash** (#F4F4F5) — Muted backgrounds, selected rows, repository pills, and skeleton loader bases.
- **Sealos Green** (#16A34A) — The single accent color for primary CTAs, active deployment state, focus rings, success markers, and selected navigation. Do not add any second accent color.

Color rules:

- Keep the system mostly neutral. Sealos Green is the only chromatic accent.
- Do not use purple, blue neon, gradient glows, or saturated AI-console colors.
- Use semantic contrast instead of decorative color: strong text, subtle borders, and one clear active state.
- Dark mode should invert the same neutral system with **Zinc Shell** (#18181B), **Deep Panel** (#27272A), **Pale Ink** (#F4F4F5), and the same Sealos Green accent.

## 3. Typography Rules

- **Display:** Commissioner — used for homepage title, section titles, and major task state headers. Track-tight, compact, and confident. Use weights 500 and 600 only.
- **Body:** Geist — used for application text, forms, dialogs, tabs, tables, and chat. Relaxed leading between 1.45 and 1.68. Keep explanatory lines under 65 characters when possible.
- **Mono:** Geist Mono — used for repository slugs, runtime identifiers, ports, commands, logs, timestamps, and all high-density numbers.
- **Scale:** Hero or landing title text should use `clamp(2.5rem, 5vw, 3.8rem)`. Workspace panel titles should stay compact between 1rem and 1.5rem.
- **Letter Spacing:** Use tight tracking only for large display text and uppercase metadata. Do not use negative tracking on dense body text.
- **Banned:** Inter, generic system-only typography for premium contexts, and all serif fonts. This is an engineering product UI; use sans-serif and mono only.

## 4. Component Stylings

- **Primary Buttons:** Solid Sealos Green fill with white text, 44px minimum height, rounded full for command actions, and tactile active feedback using `translateY(1px)` plus a slight opacity change. No outer glow.
- **Secondary Buttons:** Ghost or outline buttons with Hairline Zinc borders and Charcoal Command text. Hover states use Soft Zinc Wash, not color floods.
- **Command Bar:** The repository command form is the signature component. It should feel like a precise deployment console: rounded 28px shell, Panel White fill, one-pixel Hairline Zinc border, and a soft shadow no stronger than `0 20px 56px -44px rgba(24,24,27,0.45)`.
- **Repository Selector:** Use compact pill framing, mono or tight sans repository names, visible selected owner/repo state, and clear unavailable states. Never expose raw clone URLs as display text.
- **Cards and Panels:** Use cards only for task workspaces, file diffs, chat panels, repository lists, dialogs, and repeated task items. Default radius is 10px to 16px; use 28px only for the main command surface. Prefer border-top dividers over nested cards in dense panels.
- **Inputs and Textareas:** Label above the control or use an accessible hidden label when the layout is command-like. Focus ring uses Sealos Green at 2px. Placeholder text stays Muted Zinc and must explain the next operational step.
- **Tabs:** Use route-backed tab navigation with a quiet active underline or green foreground. Avoid pill-heavy tab clusters unless the panel is compact.
- **Logs and Terminal Output:** Mono type, fixed row rhythm, restrained contrast, and static section labels. User-facing log messages must remain static unless produced through the approved task-flow log utility.
- **Loaders:** Use skeleton bars and panel-shaped shimmer matching the final layout. Avoid generic circular spinners except inside compact button submit states.
- **Empty States:** Show the next action and the required object, such as connecting GitHub, choosing a repository, or starting a task. Empty states should not be decorative filler.
- **Error States:** Place errors inline near the failed action. User-facing error copy should be generic and safe; do not surface paths, tokens, repository URLs, branch names, or raw exception details.

## 5. Layout Principles

Use a grid-first responsive architecture with constrained content widths and clear operational zones.

- **Home Screen:** Keep the first viewport focused on repository selection and the `/sealos-deploy` command. The layout may be centered for the command surface, but surrounding content should avoid generic centered marketing composition. Prefer a compact header, a focused command panel, and a small lifecycle rail.
- **Task Workspace:** Split the workspace into stable regions: task list/sidebar, chat transcript, runtime or file context, action rail, and preview or diff areas. Do not let streaming content resize primary controls.
- **Repository Pages:** Preserve the nested route structure for commits, issues, and pull requests. Tabs should be scan-friendly, route-backed, and visually consistent across repository subsections.
- **Density:** Use 8px spacing increments. Compact controls use 8px to 12px gaps; panels use 16px to 24px internal padding; page sections use `clamp(3rem, 8vw, 6rem)` vertical rhythm.
- **Containment:** Main content should use max widths between 960px and 1400px depending on screen type. Command surfaces should not exceed 768px unless a task workspace requires it.
- **No Nested Cards:** Do not put cards inside cards for decorative depth. Use dividers, tabs, segmented panels, or unframed spacing instead.
- **No Overlap:** No text, buttons, preview panes, or task controls may overlap. Avoid absolute-positioned content stacking except for non-interactive decorative noise layers or popovers handled by Radix.
- **No Generic 3-Card Feature Rows:** When explaining capabilities, use a process rail, asymmetric two-column layout, or dense checklist instead.

## 6. Responsive Rules

- **Mobile Collapse:** Below 768px, all multi-column layouts collapse to a single column. Sidebars become drawers or top-level navigation controls.
- **No Horizontal Page Scroll:** Horizontal overflow on mobile is a critical failure. File diffs and terminal panes may scroll internally, never the whole page.
- **Touch Targets:** All buttons, menus, tabs, and selectors must provide at least a 44px tap target.
- **Command Bar Mobile:** The repository selector stacks above the command textarea. The submit button remains reachable without horizontal scrolling.
- **Typography:** Headlines use `clamp()`. Body text must remain at least 1rem or 14px depending on context. Mono logs can go to 11px only inside dedicated diff or terminal panes.
- **Preview and Diff Panels:** On small screens, preview, diff, files, and chat switch to tabs or stacked sections. Never squeeze code panes beside chat on mobile.
- **Navigation:** Desktop horizontal or sidebar navigation collapses to a clean menu button and drawer. Keep user/account actions accessible but secondary.

## 7. Motion & Interaction

Motion should confirm operational state, not perform for its own sake.

- **Default Motion:** Use spring-like motion with stiffness 100 and damping 20 for drawers, dialogs, task rows, and command panel transitions.
- **Allowed Animation Properties:** Animate `transform` and `opacity` only. Do not animate `top`, `left`, `width`, or `height`.
- **Task Progress:** Active tasks may use a low-amplitude pulse on the state marker or progress rail. Running runtime indicators may shimmer softly.
- **List Mounting:** Task lists, repository rows, and lifecycle steps should reveal with short staggered delays between 30ms and 60ms.
- **Textarea Interaction:** Focus should feel immediate and stable. Do not bounce, resize, or shift the command surface when the user types.
- **Skeletons:** Shimmer should be slow and subtle, with background-position movement only.
- **Reduced Motion:** Respect reduced-motion preferences by removing loops and using instant opacity changes.

## 8. Product-Specific Screen Guidance

- **Home:** The primary screen starts with GitHub sign-in if needed, then repository selection, then a single command action. The lifecycle labels are Analyze, Fix, Preview, Ship, Operate. Keep this path visible and do not add unrelated prompt categories.
- **Task Detail:** The task page should prioritize current state, chat turns, logs, runtime health, files changed, preview actions, and follow-up deployment work. The visual hierarchy should answer: what is running, what changed, what can be previewed, and what action is available next.
- **Repository Subpages:** Commits, issues, and pull requests should feel like support context for deployment work, not a full GitHub replacement.
- **Dialogs:** Dialogs are for authentication, confirmation, destructive actions, and focused configuration. Keep them narrow, direct, and action-led.
- **Toasts:** Toasts should be short and static. Do not include dynamic repository names, paths, secrets, branch names, commit messages, or raw error details.

## 9. Anti-Patterns (Banned)

- No emojis anywhere in the product UI.
- No Inter font.
- No serif fonts.
- No pure black (`#000000`).
- No purple or blue neon AI aesthetic.
- No neon shadows, outer glows, or oversized gradient text.
- No oversaturated accents and no second accent color.
- No custom mouse cursors.
- No overlapping UI elements or absolute-positioned content stacking.
- No decorative cards inside cards.
- No generic three-equal-card feature rows.
- No fake round-number metrics such as `99.99%` or `50%` unless backed by real data.
- No generic placeholder names like "John Doe", "Acme", or "Nexus".
- No AI copywriting cliches such as "Elevate", "Seamless", "Unleash", or "Next-Gen".
- No filler UI text such as "Scroll to explore", "Swipe down", scroll arrows, or bouncing chevrons.
- No broken external image links. Use checked local assets, generated assets, or stable placeholder sources only when needed.
- No user-facing logs with ad-hoc dynamic values. Use static strings or the approved task-flow log formatter only.
