# SyntriGuard — Claude Code Rules

## NEVER inject custom fonts, styles, or colors
- DO NOT use inline `style="font-size: ..."` or any font-size overrides
- DO NOT use `<select>` elements on dark themes — they render with unreadable white-on-light text
- Instead, use Bootstrap `dropdown-menu` + `dropdown-item` classes from the Arclon template
- The template fonts are perfect for mobile and visually impaired users — never override them
- Only use classes that already exist in the Arclon Bootstrap 5 template CSS

## Form controls on dark themes
- Native `<select>` dropdowns are BROKEN on dark themes (unreadable text)
- Always use Bootstrap dropdown buttons (`btn dropdown-toggle` + `dropdown-menu` + `dropdown-item`) instead
- `form-select` is OK inside modals and form cards where the background is controlled
- For navigation/toolbar selectors, always use Bootstrap dropdowns

## Design rules
- NO custom CSS unless absolutely necessary for layout (flex-wrap, display toggling)
- NO custom fonts, font-sizes, colors, backgrounds
- Use only template Bootstrap classes: `btn`, `btn-primary`, `btn-light`, `dropdown-menu`, `form-select`, etc.
- This platform is for Suriname's presidential private security — it must look professional
- Suriname uses mobile first — every page must work flawlessly on 350px screens

## Build process
- `npx gulp build` then `cp -r src/assets/js/pages dist/assets/js/ && cp src/assets/js/api.js dist/assets/js/api.js`
- gulp-uglify breaks async/await — JS files are copied raw to dist
- Vercel deployment uses `builds` array in vercel.json (not buildCommand/installCommand)

## Database
- Supabase PostgreSQL (cloud)
- Direct connection (IPv6): `db.pfitmniqehdtkntggzje.supabase.co:5432`
- Pooler connection (IPv4 for Vercel): `aws-1-us-east-1.pooler.supabase.com:6543`
- Password has `@` — must be URL-encoded as `%40` in connection strings

## API field naming
- Guards: use `g.full_name` (not `g.name`) for display names
- Scores: use `parseFloat(g.auto_score)` with `isNaN()` checks
- Sites: guard count is `s.guard_count` (not `s.guards_assigned`)
- Clients: contract value is `c.contract_value_srd`
