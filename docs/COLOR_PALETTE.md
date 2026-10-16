# Last Mile Guard colour themes

Last Mile Guard ships with four themes. Pick one from the palette button in the top bar (or on the landing page); the choice is remembered in the browser. **Clean White + Indigo** is the default. Tokens live at the top of `web/src/styles.css`; the picker is `web/src/components/ThemePicker.tsx`.

| Theme | Background | Cards | Text | Accent gradient | Feel |
| --- | --- | --- | --- | --- | --- |
| Clean White + Indigo (default) | `#F8FAFC` | `#FFFFFF` | `#0F172A` | `#4F46E5 → #7C3AED` | Bright, professional, bank-like |
| Emerald Light | `#F6FBF9` | `#FFFFFF` | `#0B1F17` | `#059669 → #0D9488` | Fresh, "safe money" |
| Royal Purple Light | `#FAF7FF` | `#FFFFFF` | `#1E1033` | `#7C3AED → #DB2777` | Modern, eye-catching |
| Charcoal + Amber (dark) | `#121212` | `#1C1C1E` | `#F5F5F4` | `#F59E0B → #F97316` | Neutral dark, warm accents |

Risk colours stay separate from the brand accent so a hold is never mistaken for decoration. Light themes: **hold / high** `#C81E1E`, **warn / medium** `#B45309`, **allow / low** `#047857`. Charcoal: `#F87171`, `#FACC15`, `#4ADE80`.

To add another theme, copy one `:root[data-theme="…"]` block in `styles.css`, give it a new id, and add it to `THEMES` in `ThemePicker.tsx`.
