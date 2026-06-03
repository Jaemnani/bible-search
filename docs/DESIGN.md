---
version: alpha
name: KnowAI
description: AI 성능 비교 · 학습 · 뉴스 큐레이션 플랫폼. 신뢰감 + 따뜻함의 균형을 추구.

colors:
    # 주 브랜드 — Anthropic Blue
    primary: '#0067b7'
    primary-dark: '#005595'

    # 보조 강조 — Empathy Blue (사이트 메인 강조색, 기존 325건 arbitrary hex 통합)
    empathy: '#007bff'

    # 시맨틱 — ELI5 (학습 모드 인디케이터)
    eli5: '#16a34a'
    eli5-light: '#f0fdf4'
    eli5-dark: '#15803d'

    # 시맨틱 — 액션 / 강조
    accent-yellow: '#ffe066'
    royal-purple: '#FF007B'
    grey: '#BCCCDC'

    # 시맨틱 — 정보 상태
    success: '#0070f3'
    danger: '#dc2626'
    warning: '#f59e0b'

    # 면 / 텍스트
    text-base: '#0b1215'
    text-muted: '#6b7280'
    background-light: '#fafaf6'
    surface: '#ffffff'
    surface-muted: '#f5f5f5'
    border: '#e5e7eb'
    link: '#0067b7'
    link-hover: '#005595'

typography:
    # 본문 (Pretendard Variable + Noto JP + Noto Sans fallback)
    body:
        fontFamily: Pretendard Variable, Pretendard, var(--font-noto-sans-jp), var(--font-noto-sans), sans-serif
        fontSize: 17px
        lineHeight: 1.7
    body-lg:
        fontFamily: Pretendard Variable, Pretendard, var(--font-noto-sans-jp), var(--font-noto-sans), sans-serif
        fontSize: 20px
        lineHeight: 1.7
    caption:
        fontFamily: Pretendard Variable, Pretendard, var(--font-noto-sans-jp), var(--font-noto-sans), sans-serif
        fontSize: 14px
        lineHeight: 1.5
    caption-sm:
        fontFamily: Pretendard Variable, Pretendard, var(--font-noto-sans-jp), var(--font-noto-sans), sans-serif
        fontSize: 11px
        lineHeight: 1.4
    caption-xs:
        fontFamily: Pretendard Variable, Pretendard, var(--font-noto-sans-jp), var(--font-noto-sans), sans-serif
        fontSize: 10px
        lineHeight: 1.4

    # 헤딩 (Barlow display + Pretendard fallback)
    display:
        fontFamily: var(--font-barlow), Pretendard Variable, Pretendard, var(--font-noto-sans-jp), sans-serif
        fontSize: 80px
        lineHeight: 1.1
        letterSpacing: -0.04em
    heading-1:
        fontFamily: var(--font-barlow), Pretendard Variable, Pretendard, var(--font-noto-sans-jp), sans-serif
        fontSize: 56px
        lineHeight: 1.15
        letterSpacing: -0.02em
    heading-2:
        fontFamily: var(--font-barlow), Pretendard Variable, Pretendard, var(--font-noto-sans-jp), sans-serif
        fontSize: 40px
        lineHeight: 1.2
        letterSpacing: -0.02em
    heading-3:
        fontFamily: var(--font-barlow), Pretendard Variable, Pretendard, var(--font-noto-sans-jp), sans-serif
        fontSize: 28px
        lineHeight: 1.3

rounded:
    none: 0px
    sm: 4px
    md: 8px
    lg: 12px
    xl: 16px
    2xl: 24px
    3xl: 32px
    full: 9999px

spacing:
    xs: 4px
    sm: 8px
    md: 16px
    lg: 24px
    xl: 32px
    2xl: 48px
    3xl: 64px

components:
    button-primary:
        backgroundColor: '{colors.primary}'
        textColor: '{colors.surface}'
        rounded: '{rounded.md}'
        padding: 12px
    button-primary-hover:
        backgroundColor: '{colors.primary-dark}'
    button-secondary:
        backgroundColor: '{colors.surface}'
        textColor: '{colors.text-base}'
        rounded: '{rounded.md}'
        padding: 12px
    button-ghost:
        backgroundColor: '{colors.surface-muted}'
        textColor: '{colors.text-base}'
        rounded: '{rounded.md}'
        padding: 12px
    button-danger:
        backgroundColor: '{colors.danger}'
        textColor: '{colors.surface}'
        rounded: '{rounded.md}'
        padding: 12px

    badge-default:
        backgroundColor: '{colors.surface}'
        textColor: '{colors.text-muted}'
        rounded: '{rounded.full}'
        padding: 4px
    badge-empathy:
        backgroundColor: '{colors.primary}'
        textColor: '{colors.surface}'
        rounded: '{rounded.full}'
        padding: 4px
    badge-eli5:
        backgroundColor: '{colors.eli5-light}'
        textColor: '{colors.eli5-dark}'
        rounded: '{rounded.full}'
        padding: 4px
    badge-success:
        backgroundColor: '{colors.eli5-light}'
        textColor: '{colors.eli5-dark}'
        rounded: '{rounded.full}'
        padding: 4px
    badge-warning:
        backgroundColor: '{colors.accent-yellow}'
        textColor: '{colors.text-base}'
        rounded: '{rounded.full}'
        padding: 4px
    badge-danger:
        backgroundColor: '{colors.danger}'
        textColor: '{colors.surface}'
        rounded: '{rounded.full}'
        padding: 4px

    card-sm:
        backgroundColor: '{colors.surface}'
        rounded: '{rounded.md}'
        padding: 12px
    card-md:
        backgroundColor: '{colors.surface}'
        rounded: '{rounded.lg}'
        padding: 16px
    card-lg:
        backgroundColor: '{colors.surface}'
        rounded: '{rounded.xl}'
        padding: 20px
    card-xl:
        backgroundColor: '{colors.surface}'
        rounded: '{rounded.2xl}'
        padding: 24px

    input-base:
        backgroundColor: '{colors.surface}'
        textColor: '{colors.text-base}'
        rounded: '{rounded.md}'
        padding: 12px
---

# KnowAI Design System

This file is the **source of truth** for KnowAI's design tokens. The Tailwind v4 `@theme` block in `src/app/globals.css` is **generated** from this file via `npm run design:export`.

Manual edits to color/typography tokens in `globals.css` are not allowed — change them here, run export, commit both.

## Overview

KnowAI is an AI performance comparison, learning, and news curation platform. The brand sits between **authoritative** (data-rich rankings, technical benchmarks) and **warm/approachable** (eli5 mode, friendly explanations).

**Personality**

- Trustworthy but not stiff
- Information-dense without feeling overwhelming
- Bilingual (Korean / Japanese / English) and locale-aware
- Calm. No noisy gradients or skeuomorphism

**Target**

- AI 모델·서비스를 비교·평가하려는 사용자 (전문가 + 입문자)
- 일·한·영 3개 권역. 모바일·데스크탑 균형

## Colors

The palette is rooted in a **single blue accent system** with a green ELI5 indicator and yellow for action highlights.

- **Primary `#0067b7` (Anthropic Blue):** main brand color. Links, primary buttons, focused state, key emphasis.
- **Primary Dark `#005595`:** hover/active state for primary surfaces.
- **Empathy `#007bff` (Empathy Blue):** secondary emphasis blue used across cards, accents, and CTA hover states. Historically the most-used arbitrary hex on the site (325 occurrences) — now tokenized for consistency.
- **ELI5 `#16a34a` / Light `#f0fdf4` / Dark `#15803d`:** the green indicator for the "ELI5 (Explain Like I'm 5)" learning mode. Light is background, base is icon/text, dark is hover.
- **Accent Yellow `#ffe066`:** highlight for arenas, badges, and special CTAs. Use sparingly — yellow loses meaning if everywhere.
- **Success `#0070f3` / Danger `#dc2626` / Warning `#f59e0b`:** state colors. Danger is reserved for destructive actions and error banners.
- **Text Base `#0b1215`:** primary text. Almost black with a slight blue cast for readability.
- **Text Muted `#6b7280`:** secondary text, metadata, captions.
- **Background Light `#fafaf6`:** primary canvas. Slightly warm off-white — softer than pure white, more inviting.
- **Surface `#ffffff`:** card and modal surfaces. Sits above background.
- **Surface Muted `#f5f5f5`:** inset surfaces (input fields, code blocks, secondary chips).
- **Border `#e5e7eb`:** default 1px borders for cards, dividers, inputs.
- **Link `#0067b7` / Link Hover `#005595`:** inline links inherit from primary.

## Typography

Two type families, used in stacks:

- **Display family — `Barlow`** (with Pretendard Variable fallback for Korean/Japanese): used for `display`, `heading-1` through `heading-3`. Tight tracking (`-0.04em` on display, `-0.02em` on h1/h2). Headings retain Barlow for Latin and shift to Pretendard for CJK.
- **Body family — `Pretendard Variable`** (with Noto Sans JP and Noto Sans fallback): used for body, captions, and UI labels. Optimized for CJK readability.

**Scale (mobile first, with desktop ceilings)**

The tokens above define the **base desktop sizes**. In `globals.css` these are wrapped in `clamp(min, vw, max)` to scale responsively on mobile — so the YAML values represent the desktop ceiling, not the only size.

| Token        | Desktop | Use                                               |
| ------------ | ------- | ------------------------------------------------- |
| `display`    | 80px    | Marketing hero only                               |
| `heading-1`  | 56px    | Page H1                                           |
| `heading-2`  | 40px    | Section H2                                        |
| `heading-3`  | 28px    | Subsection H3 / card titles                       |
| `body-lg`    | 20px    | Long-form paragraph (news body, learning content) |
| `body`       | 17px    | Default body, lists, button labels                |
| `caption`    | 14px    | Metadata, timestamps                              |
| `caption-sm` | 11px    | Tags, badges (used heavily in tables/grids)       |
| `caption-xs` | 10px    | Subscripts, axis labels, very dense lists         |

**iOS guard — Form inputs**: all `<input>` / `<textarea>` use **at least body (17px)**. Anything smaller triggers iOS Safari auto-zoom on focus. Never style form inputs with `caption` or smaller.

## Layout

**Spacing scale** maps to Tailwind defaults `1=4px` ... `12=48px`. The named tokens above (`xs/sm/md/lg/xl/2xl/3xl`) are the **recommended subset** for new layouts; ad-hoc Tailwind values like `gap-7` are allowed but discouraged for primary structure.

**Container width** is **`max-w-[1280px]`** for default content. Hero / Gallery / Marketing layouts may use `max-w-[1440px]` via the `wide` Container variant. The single source of truth is `src/app/_components/container.tsx`.

**Main wrapper** must always be `w-full max-w-[<n>] mx-auto px-5 grow` on mobile-first pages. Flex parents with `mx-auto` will shrink the main without `w-full`.

## Elevation & Depth

Shadows are deliberately understated.

- `shadow-sm` — `0 5px 10px rgba(0,0,0,0.12)` — default card lift
- `shadow-md` — `0 8px 30px rgba(0,0,0,0.12)` — elevated modals, dropdowns
- `shadow-glow` — `0 0 20px -5px rgba(246,209,104,0.5)` — accent ring on active arena cards (yellow glow)

No `xl/2xl` heavy shadows. Stack depth via background contrast and border, not blur.

## Shapes

Rounded radii from `none` (0) to `full` (9999px). Default surface radius is `lg (12px)`. Buttons and inputs use `md (8px)`. Badges and avatars use `full`.

Avoid mixing `xl/2xl` on small elements — the radius should feel proportional to the element. Small badge with `2xl` looks awkward.

## Motion (interactive states)

Modern minimal — restrained lift, accent-color border, snappy easing. Avoid large transforms (`scale 1.04`, `y -4`) and slow durations (>300ms) which feel sluggish in 2026.

### Standard hover for bordered cards/options/buttons

```
transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1)   /* ease-out-quint */
hover:
    border-color: var(--color-empathy)                 /* #007bff */
    translateY: -1px                                   /* subtle lift */
active:
    scale: 0.98
    translateY: 0
```

Tailwind utility shortcut:

```
border border-stone-200 transition-all duration-200
hover:border-empathy hover:-translate-y-px
active:scale-[0.98] active:translate-y-0
```

Framer-motion shortcut (when entry/exit anims also needed):

```tsx
<motion.button
    whileHover={{ y: -1 }}
    whileTap={{ scale: 0.98 }}
    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    className="border border-stone-200 hover:border-empathy transition-colors duration-200"
/>
```

### CTA pills (bg-empathy, no border)

```
hover:
    background-color: var(--color-primary-dark)        /* button-primary-hover token */
    translateY: -1px
active:
    scale: 0.98
```

### Do's

- Use the standard above for any bordered interactive surface (option card, vote button, next-round card, leaderboard row).
- Prefer 1px lift over scale for cards — scale shifts neighbors, lift doesn't.
- 200ms is the default; 100ms for press feedback only.

### Don'ts

- Don't combine `scale > 1.02` with `y > -2` on cards — feels juvenile.
- Don't apply hover effects to non-interactive surfaces (display-only metrics).
- Don't hand-roll different timings per component — stick to 200ms / ease-out-quint.

## Components

The primitives in the YAML `components` section above describe the **base styles** that the React primitive components in `src/components/ui/` will render. Detailed component implementation (Base UI bindings, variants, a11y) lives in code — this file is the visual contract.

- **Button** — variants `primary` / `secondary` / `ghost` / `danger` × sizes `sm` / `md` / `lg`. Default border-radius `md`.
- **Badge** — variants `default` / `empathy` / `eli5` / `success` / `warning` / `danger`. Size `sm` (py-0.5 px-2) / `md` (py-1 px-3). Pill-shaped (`rounded-full`).
- **Card** — base shell with `surface` background. Size variants:
    - `sm` — `rounded-md` (8px) / padding 12px — inner sections, list rows
    - `md` — `rounded-lg` (12px) / padding 16px — default card, article preview, list item
    - `lg` — `rounded-xl` (16px) / padding 20px — widget tile, pricing/plan card, dropdown menu
    - `xl` — `rounded-2xl` (24px) / padding 24px — hero card, profile card, modal container
      `border` and `shadow` props are independent of size. Choose size by visual hierarchy, not by content.
- **Input** — minimum 16px font size (iOS guard), `md` rounded, `border` outline. Focus state uses `primary` ring.
- **Modal** — built on `@base-ui-components/react/dialog`. Backdrop dim, focus trap, esc close, scroll lock.
- **Dropdown** — built on `@base-ui-components/react/menu`. Replaces all `addEventListener('mousedown')` patterns.
- **Select** — built on `@base-ui-components/react/select`. Replaces all native `<select>` (Tailwind v4 incompatible).

## Do's and Don'ts

### ✅ Do

- Use design tokens (`text-primary`, `bg-empathy`, etc.) — never hardcode hex values in `className`.
- Use Base UI primitives for Modal / Dropdown / Select.
- Use the `Container` component for page layout. Specify the `maxW` variant explicitly when wide is needed.
- Apply `priority` on the largest above-the-fold image (`next/image priority`) — typically one per page.
- Use `next/image` for all images except external CDN that explicitly needs to bypass optimization (`unoptimized` prop, justified by comment).
- Reference logos via `src/lib/service-logos.ts`. The mapping is the SOT — never hardcode `/images/logos/*` paths.
- For text in `<input>` / `<textarea>` / `<select>`, ensure `text-base` (16px) or larger on mobile.
- Use the `backdrop div` pattern for dropdown outside-click (iOS Safari compatibility):
    ```tsx
    {
        open && (
            <>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
                <div className="absolute ... z-50">{/* dropdown content */}</div>
            </>
        );
    }
    ```

### ❌ Don't

- Don't use arbitrary hex (`text-[#007bff]`, `bg-[#fafaf6]`) — add to DESIGN.md as a token first.
- Don't use native `<select>` — broken in Tailwind v4. Use the `Select` primitive from `src/components/ui/`.
- Don't use `document.addEventListener('mousedown' | 'touchstart' | 'pointerdown')` for closing dropdowns. iOS Safari does not bubble taps on non-interactive elements. Use the `backdrop div` pattern.
- Don't render markdown via `dangerouslySetInnerHTML` without first escaping (`escapeHtml`) or routing through the `markdownToHtml` pipeline (which uses `rehype-sanitize`).
- Don't add `loading="lazy"` to the LCP image — that defeats the LCP optimization.
- Don't write new components inside `_components/mockup/*`. Mockup folders are scheduled for deletion.
- Don't use arbitrary `rounded-[NNpx]` values (e.g. `rounded-[10px]`, `rounded-[2px]`) — the 4 Card variants + `rounded-full` cover the visual hierarchy. If a one-off is needed, add a new variant to DESIGN.md first.
- Don't use `rounded-3xl` — too large for any element used on the site. Use `xl` variant (rounded-2xl) instead.
