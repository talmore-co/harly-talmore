# Live conversion correction, September 17

Use `meta-replacement-state.json` for the current ad set and ad IDs. The older
`meta-paused-state.json` is a historical setup record, not current live state.
Do not rerun the setup script to reconcile the live campaign.

- Campaign: `120254404943020440`
- Paused original ad set: `120254404946080440`
- Enabled replacement ad set: `120254406135120440`
- Corrected custom conversion: `2079722146239839`
- Original custom conversion: `1814490013300940`
- Reported spend at switch: EUR 26.03
- Replacement lifetime budget: EUR 253.97
- Campaign spend cap: EUR 280.00
- End: October 1, 2026, 08:29:59 UTC+8

The original conversion matched only the job URL. Server events use the
application URL. The replacement matches QualifiedApplication plus either URL.
An attempted in-place rule update returned success but did not persist.
Updating the published ad set's conversion failed with subcode 3260011.
The user approved replacement and a restart of learning. Five new ads reuse
the existing five creatives. Old history is retained.

Production review found the recent ten server deliveries accepted by Meta.
At the latest pipeline check, 14 applications on September 17 in Singapore
time all had questionnaire scores >=70, and seven had saved Meta attribution.
Ten applications fell in the 01:00–02:00 UTC interval, compared with an earlier
Meta raw event sample of 21 submissions and 21 qualifications for that hour.
These raw counts are not verified unique or ad-attributed conversions.
Code inspection confirms shared browser/server event names and application IDs.
Local integration tests verify those IDs, below-threshold behavior and consent.
Live Meta-side deduplication and a matched result on the replacement conversion
still need confirmation. Do not replay historical events to manufacture results.
