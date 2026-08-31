---
name: Technical Precision Light
colors:
  surface: '#f4fbf9'
  surface-dim: '#d5dbda'
  surface-bright: '#f4fbf9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff5f3'
  surface-container: '#e9efee'
  surface-container-high: '#e3e9e8'
  surface-container-highest: '#dde4e2'
  on-surface: '#161d1c'
  on-surface-variant: '#3c4948'
  inverse-surface: '#2b3231'
  inverse-on-surface: '#ecf2f0'
  outline: '#6c7a78'
  outline-variant: '#bbc9c7'
  surface-tint: '#006a66'
  primary: '#006a66'
  on-primary: '#ffffff'
  primary-container: '#3fd0c9'
  on-primary-container: '#005552'
  inverse-primary: '#4ddad3'
  secondary: '#006d41'
  on-secondary: '#ffffff'
  secondary-container: '#95f3b9'
  on-secondary-container: '#007144'
  tertiary: '#8f4e03'
  on-tertiary: '#ffffff'
  tertiary-container: '#ffa95d'
  on-tertiary-container: '#743e00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ff7f0'
  primary-fixed-dim: '#4ddad3'
  on-primary-fixed: '#00201e'
  on-primary-fixed-variant: '#00504d'
  secondary-fixed: '#98f6bc'
  secondary-fixed-dim: '#7cd9a1'
  on-secondary-fixed: '#002110'
  on-secondary-fixed-variant: '#005230'
  tertiary-fixed: '#ffdcc2'
  tertiary-fixed-dim: '#ffb77b'
  on-tertiary-fixed: '#2e1500'
  on-tertiary-fixed-variant: '#6d3a00'
  background: '#f4fbf9'
  on-background: '#161d1c'
  surface-variant: '#dde4e2'
  status-healthy: '#63C08A'
  status-warning: '#D9A64A'
  status-critical: '#E8786C'
  surface-border: '#E2E8F0'
  background-subtle: '#F8FAFC'
typography:
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  code-md:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: '450'
    lineHeight: 18px
  code-sm:
    fontFamily: IBM Plex Mono
    fontSize: 12px
    fontWeight: '450'
    lineHeight: 16px
  nav-item:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 20px
  table-header:
    fontFamily: IBM Plex Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar_width: 240px
  row_height_compact: 36px
  row_height_standard: 44px
  edge_margin: 24px
  gutter: 16px
---

## Brand & Style

This design system is a high-density, utility-focused framework engineered for technical environments like cloud infrastructure, observability platforms, and developer tooling. Transitioning to a light-mode aesthetic, it maintains a **Modern Minimalist Functionalism** that prioritizes clarity and information density over decorative flair.

The atmosphere is "Laboratory Clean"—professional, precise, and efficient. It rejects depth and shadows in favor of structural integrity. Visual hierarchy is established through hairline dividers and tonal shifts in gray, creating a "Sheet-on-Sheet" layout that feels robust and native to a high-performance workflow. The brand personality is clinical and reliable, ensuring that complex data remains the primary focus.

## Colors

The color strategy is designed for long-term legibility on a light ground, using high-chroma accents sparingly to signal importance.

- **Foundations:** The primary background is a clean, neutral white (#FFFFFF), with a secondary background layer of cool, light gray (#F8FAFC) used for sidebars and header sections to provide structural contrast.
- **Accent:** The signature cyan-teal (#3FD0C9) serves as the primary action color. On a light background, this color is paired with dark text or used as a bold indicator to ensure it meets accessibility requirements.
- **Semantic Utility:** Status colors are tuned for light-mode clarity. **Healthy** (Green) uses a medium-weighted forest tone, **Warning** (Amber) leans towards a burnt orange for better contrast against white, and **Critical** (Red) uses a soft but urgent coral.
- **Dividers:** A consistent 1px hairline (#E2E8F0) is the workhorse of the system, replacing all shadows to define the boundaries of the interface.

## Typography

The system utilizes a dual-font strategy to separate UI controls from technical data.

- **IBM Plex Sans:** The primary typeface for navigation, labels, and instructional text. It offers a professional, neutral tone that stays legible at the system's small scale.
- **IBM Plex Mono:** The "Data Typeface." It is used for all machine-generated content, including IDs, IP addresses, code snippets, and logs. This ensures that character distinction (e.g., 0 vs O) is maintained in dense data environments.
- **Density Scaling:** Typography is kept intentionally compact. Large display sizes are avoided; instead, hierarchy is created through weight changes (Regular to SemiBold) and the use of the Monospaced font for technical identifiers.

## Layout & Spacing

The layout is optimized for desktop productivity, prioritizing information density and horizontal scanning.

- **Grid Model:** A structured fluid layout that respects fixed-width sidebars. The main content stage utilizes a 24px outer margin.
- **Sidebar:** A fixed 240px column on the left, typically using the `background-subtle` (#F8FAFC) color to distinguish it from the main workspace.
- **Vertical Rhythm:** The system uses two row height standards. `row_height_compact` (36px) is the default for log streams and high-volume data tables. `row_height_standard` (44px) is reserved for forms and settings lists.
- **Breakpoints:**
  - **Desktop:** >1024px. Full sidebar and 12-column grid.
  - **Tablet:** 768px - 1024px. Sidebar collapses to icons; 8-column grid.
  - **Mobile:** <768px. Sidebar hidden (hamburger menu); 4-column grid; 16px edge margins.

## Elevation & Depth

This system avoids the use of shadows entirely, relying on **Flat Tonal Layering** and **Hairline Stroke Separation**.

- **Surface Tiering:** Depth is conveyed by shifting background values. The base ground is #F8FAFC, while the active "Work Surface" (like a table or card area) is #FFFFFF.
- **Structural Dividers:** Every functional group (header, sidebar, table row) is separated by a 1px solid divider (#E2E8F0). This creates a crisp, architectural look.
- **Backdrop Blurs:** Used sparingly for modal overlays to maintain a sense of context without introducing heavy drop shadows.
- **Interaction States:** Hover states are indicated by a subtle background shift to #F1F5F9 rather than a lift or shadow effect.

## Shapes

The shape language is conservative and geometric to reflect technical precision. 

- **Standard Radius:** A 4px (0.25rem) radius is used for buttons, inputs, and containment boxes. This provides just enough softening to feel modern without losing the "engineered" aesthetic.
- **Functional Shapes:** Status dots are perfect circles (8px). Tags or pills use the standard 4px radius rather than a full pill shape to keep them aligned with the grid's rectilinearity.

## Components

### Buttons
- **Primary:** Background #3FD0C9, Text #FFFFFF. Bold and clearly the primary action.
- **Secondary:** White background, 1px #E2E8F0 border, Text #475569.
- **Ghost:** No background or border, Text #64748B. Used for secondary actions in headers.

### Data Tables
- **Headers:** Light gray background (#F8FAFC), 1px bottom border, text in `table-header` style.
- **Cells:** Use `code-md` for data values. Horizontal borders only.
- **Hover:** Rows highlight with #F1F5F9 to assist in horizontal scanning.

### Status Indicators
- **Pills:** A 1px border of the status color with a 10% opacity background of the same color. Text is high-contrast dark gray.
- **Dots:** 8px solid circles. Used in tables next to text to show system health at a glance.

### Input Fields
- **Styling:** #FFFFFF background, 1px #E2E8F0 border. On focus, the border changes to #3FD0C9 with no outer glow.
- **Technical Inputs:** Any field for Hostnames or IDs must use IBM Plex Mono.

### Navigation
- **Active State:** The active sidebar item uses a subtle #F1F5F9 background and a 2px vertical "power-bar" on the far left in #3FD0C9. 
- **Icons:** 16px optical size, neutral gray (#94A3B8) when inactive.