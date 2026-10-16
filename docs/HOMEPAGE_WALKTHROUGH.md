# Last Mile Guard homepage: first-visit product walkthrough

This update is based on the `develop` branch archive at commit `6096413` (Refresh Last Mile Guard branding and colors). It changes the homepage and adds no backend/API features.

## Visitor flow

1. A first-time visitor sees the product purpose, an illustrative risk decision, and a **See how it works** action.
2. The six-stage journey starts once when scrolled into view, except for visitors who request reduced motion. All stages are interactive and support keyboard access; **Replay journey** restarts it.
3. The industry evidence panel shows independently sourced public regulatory figures and links to the primary reports.
4. The three-view synthetic case preview describes the payment, scam signals, and explainable recommendation. The CTA opens the existing assessment console.
5. Existing FraudShield, ScamStop, synthetic MuleNet, the analyst queue, Evidence, Architecture, and the 90-second story remain available.

## Industry research used

- FTC, June 2026: about $16B reported US fraud losses in 2025; $3.5B reported US imposter scam losses in 2025. https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-data-show-people-reported-losing-3-point-5-billion-imposter-scams-2025
- RBI Annual Report 2024–25: 13,516 card/internet bank fraud cases reported in FY 2024–25. The reported year does not mean all incidents originated that year. https://www.rbi.org.in/scripts/AnnualReportPublications.aspx?Id=1436
- FTC consumer guidance, March 2025: 2024 scam patterns and bank transfers. https://consumer.ftc.gov/consumer-alerts/2025/03/top-scams-2024

The external statistics are **not product efficacy metrics**, nor should values be summed across geographies. All case data, the sample risk 74/100, and the account graph shown on this page are explicitly synthetic.

## Run locally (Windows PowerShell)

```powershell
cd "$HOME\Projects\scamguard"
git switch develop
git status --short
# The patch must be downloaded to your Downloads directory first.
git apply --check "$HOME\Downloads\scamguard-homepage-develop-v2.patch"
git apply "$HOME\Downloads\scamguard-homepage-develop-v2.patch"
cd web
npm.cmd ci
npm.cmd run build
npm.cmd run test
npm.cmd run dev
```

Open the URL printed by Vite (typically http://localhost:5173/). Live Gemini operation requires the backend to be configured and running separately.

Do not commit until the landing page, its mobile layout, external citations, and existing console/analyst navigation are tested. The existing `main` branch must remain unchanged.
