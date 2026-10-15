---
name: traffic-drop-diagnosis
description: "Explain why organic traffic dropped using Search Console, the latest site audit, and Google Analytics, and turn the result into a short, evidence-backed list of causes and next steps."
---

# OpenSEO Traffic Drop Diagnosis

## Goal

Answer "why did our organic traffic drop?" with evidence, not guesses. Separate the four usual explanations: lost rankings, lower search demand, a technical or indexing problem, and a measurement problem. End with the one or two actions most likely to recover traffic.

Use this when the user reports fewer clicks, visits, or signups from Google, or asks what happened to a page or the whole site. For a general health check without a known drop, use `seo-audit` instead.

## Required inputs

- `projectId` (use `list_projects`)
- The period to diagnose, if the user knows when the drop started. Otherwise use the default last 28 days.

## OpenSEO MCP tools

- `diagnose_traffic_drop`: the core call. Compares the period with the equal-length previous period and returns losing queries and pages, audit status and GA4 sessions for the top losing pages, ranked `causes` with evidence, and `diagnostics` that say which data was missing.
- `inspect_urls`: confirm Google's index status and selected canonical for the top losing pages, up to 10 per call.
- `get_search_console_performance`: drill into one losing page (filter by page, dimensions `['query']`) or plot clicks by `date` to find the day the drop started.
- `run_site_audit`: run one when diagnostics say no audit exists or the audit predates the drop, then call `diagnose_traffic_drop` again.

All of these are free; none spend credits.

## Workflow

1. Resolve the `projectId`. If the user names the start of the drop, pick a window that starts on that day and lasts as long as the drop has been visible (at least 7 days, so weekday effects cancel out).
2. Call `diagnose_traffic_drop`. If Search Console is not connected, stop and send the user the `connectUrl`.
3. Read `diagnostics` first. Missing GA4 means measurement problems cannot be ruled out; a missing or old audit means technical problems cannot be ruled out. Say so in the answer.
4. For the top 3 to 5 losing pages, call `inspect_urls`. A page that is not indexed, or whose Google-selected canonical differs from its own URL, is a technical cause even when the audit looks clean.
5. If a cause is close to a tie, or the drop looks sitewide and sudden, plot `get_search_console_performance` by `date` to find the start day and compare it with known deploys, migrations, or Google updates the user mentions.

## How to read the causes

- `ranking_loss`: queries ranked worse or stopped appearing. Look at whether the losses cluster on one page (content or competitor problem) or spread across the site (algorithm update or sitewide technical change).
- `demand_drop`: position held, impressions fell. Usually seasonality or a trend; not something to fix on the site.
- `serp_ctr_change`: position and impressions held, clicks fell. Usually AI answers, new SERP features, or a weaker title and description.
- `technical_indexing`: a losing page is noindex, not 200, canonicalized elsewhere, or blocked in the latest audit.
- `measurement`: GA4 organic sessions fell far more than Search Console clicks. Check tracking, consent banners, and channel grouping before touching content.

`weight` is the share of the click loss each cause explains (for `measurement`, the size of the gap). It is a heuristic for ordering, not a probability.

## Output

Lead with one sentence: how big the drop is (clicks before and after, percent change) and the most likely cause. Then:

1. Likely causes, most likely first, each with 1 to 3 concrete evidence lines (query or page, before and after numbers).
2. What the data could not rule out, from `diagnostics`.
3. Next steps: one or two specific actions tied to the top cause, such as "remove the noindex from /pricing" or "rewrite the title of /blog/x, which kept position 3 but lost half its clicks".

Do not list every losing query. Keep the answer short enough to read in a minute, and offer the full tables on request.
