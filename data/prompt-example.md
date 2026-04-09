Redesign the landing page at https://example-saas.lovable.app

## KEEP
- Overall layout structure: single-column hero → features grid → testimonials → CTA
- Brand color palette base: deep navy (#0F172A) and electric blue (#3B82F6) — these have strong brand recognition
- Typography choice: Inter for body text — clean and readable at all sizes
- Social proof section placement below features — good conversion flow

## DESIGN SYSTEM
Colors:
- Primary: #3B82F6 (electric blue) — use for CTAs, links, active states
- Primary hover: #2563EB
- Background: #0F172A (deep navy) for hero, #FFFFFF for content sections
- Surface: #F8FAFC for cards and alternating sections
- Text primary: #0F172A on light, #F8FAFC on dark
- Text secondary: #64748B
- Accent: #10B981 (emerald) for success states and checkmarks
- Border: #E2E8F0

Typography:
- H1: Inter 48px/1.1 font-weight 700, letter-spacing -0.02em
- H2: Inter 32px/1.2 font-weight 600
- H3: Inter 20px/1.3 font-weight 600
- Body: Inter 16px/1.6 font-weight 400
- Small: Inter 14px/1.5 font-weight 400, color #64748B

## CHANGE
1. [high/low] Hero headline "Welcome to Our Platform" is generic and fails to communicate value → Replace with benefit-driven copy: "Ship 10x Faster With AI-Powered Workflows" — set H1 to 48px/700 with -0.02em tracking, color #F8FAFC on the navy background
2. [high/low] CTA button is 32px tall with 12px padding, below the 44px minimum tap target → Increase to height 48px, padding 16px 32px, font-size 16px/600, add subtle shadow (0 4px 14px rgba(59,130,246,0.4)), border-radius 12px
3. [high/medium] Features section uses a plain list with no visual hierarchy → Switch to a 3-column Bento Grid layout with icon + title + description per card, 24px gap, cards on #F8FAFC with 1px #E2E8F0 border and border-radius 16px
4. [medium/low] Body text contrast ratio is 3.2:1 (#9CA3AF on #FFFFFF) — fails WCAG AA → Change body text to #374151 (7.5:1 ratio) for all paragraph text
5. [medium/medium] No social proof near the primary CTA — visitors see the price before trust signals → Add a row of 3 Testimonial Cards directly above the pricing section, each showing avatar + quote + company name

## COMPONENTS TO UPGRADE
- Hero section → use "Animated Hero" from 21st.dev: replaces the static hero with entrance animations that guide the eye to the CTA, improving first-impression engagement
- Features section → use "Bento Grid": organizes 6 features in a visually rich modular layout that communicates product depth better than a plain list
- CTA button → use "Sparkles": adds subtle particle effects around the primary CTA that increase click-through without feeling gimmicky
- Testimonials → use "Testimonials Columns": displays multiple testimonials in a masonry grid, maximizing social proof density

## CONSTRAINTS
- WCAG AA compliance: minimum 4.5:1 contrast for text, 3:1 for UI elements, 44px minimum touch targets
- Mobile responsive: all components must work at 375px viewport width
- Performance: prefer CSS animations over JavaScript; lazy-load images below the fold
