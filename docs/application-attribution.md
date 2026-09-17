# Application attribution

Hosted career pages, job listings and application forms capture tagged visits
after the visitor grants marketing consent. No Meta token or Pixel is required
for Harly's internal attribution. Tracking does not make network requests.

Supported URL parameters:

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- `campaign_id`, `adset_id`, `ad_id`

Use IDs as well as readable labels so renamed campaigns remain identifiable.
For Meta ads, configure these URL parameters in Ads Manager, using its dynamic
parameter picker for the values:

```text
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}
```

## Capture and persistence

Each workspace has its own browser-storage entry with first and latest attributed
visits, a path-only landing page and an ISO timestamp. Untagged navigation and
refreshing the same tagged page preserve the current attribution. A different
tagged visit updates the latest touch. Entries expire 30 days after first capture.
Revoking marketing consent clears browser attribution stored on this origin.
Visitors who do not consent can still apply without attribution. Visits before
consent are not persisted; accepting consent captures parameters still present on
the current page. Disabled browser storage supports the current page only.

Submission attaches the snapshot to FormData. The server rechecks marketing
consent, validates its size, fields, timestamps and workspace, and saves it in the
application transaction. Values are visitor-provided, not verified by Meta.
Arbitrary URL parameters, full URLs, fragments and click identifiers are not stored
in this snapshot. Pixel `_fbc` matching remains separate.

The saved application snapshot is historical: it does not expire after 30 days or
change when the visitor returns. Candidate application details show both visits.
Both pipeline views offer a source/campaign/ad search and a CSV export of the
currently filtered applications, including attribution, status and scores.
CSV exports neutralize spreadsheet formula prefixes. Existing applications remain
unattributed. No retroactive attribution is inferred.

Pipeline sorting is independent of attribution. **Manual pipeline order** uses
the saved drag order, with newest application first when positions tie. AI-fit
and questionnaire-score sorting remain available. **Rate the rest** sits beside
the score filters and evaluates remaining active applicants for the selected job,
including applicants hidden by the current filters.

Portal, embedded and API submissions do not collect this hosted-form attribution.

## Deployment

Run additive migration `0151_nervous_mulholland_black` before starting the new app.
It adds nullable `applications.attribution` JSONB. No additional secrets or
environment variables are required. Keep the column if rolling back the app.
# Pipeline display

The pipeline list shows application date and time in the recruiter's browser
timezone. Hovering the timestamp shows the full date and named timezone.

A Meta icon beside the submission source appears when either saved visit has a
recognized Meta source and a paid medium or ad ID. Organic Meta visits, other ad
networks, and conversion delivery alone do not trigger the icon. Hovering or
keyboard-focusing it shows the captured ad label, source, campaign, IDs, landing
path and visit time. Distinct first/latest visits are shown separately. The
tooltip uses historical snapshots without applying browser-storage expiry;
attribution remains visitor-provided rather than independently Meta-verified.
