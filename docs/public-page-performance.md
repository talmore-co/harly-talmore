# Public page mobile performance

Measured on 2026-09-16 with a local production build, Chrome DevTools tracing,
390×844 mobile viewport, device scale factor 2, Slow 4G network throttling and
4× CPU slowdown. Each comparison uses a fresh isolated browser context with
empty cache/storage and a warmed local application server. These are lab results,
not measurements from Philippine mobile networks or the deployed VPS.

| Page | Before LCP | After LCP | Before / after CLS |
| --- | ---: | ---: | ---: |
| Career board | 2.087 s | 1.223 s | 0.00 / 0.00 |
| Individual job listing | 2.393 s | 1.230 s | 0.00 / 0.00 |

The first optimized run recorded 1.245 s LCP and 964 ms first contentful paint;
a fresh-context check after the final UI/title changes recorded 1.223 s LCP.
Single-run comparisons vary;
there is no field INP result or CrUX data for the local pages. Deployment location,
real network latency, configured images and third-party scripts affect live results.

## Changes

- Use one 32,236-byte variable Onest font for all UI weights instead of preloading
  three static Onest fonts, its variable font and Geist Mono. The tested board's
  font download falls from 146,840 to 32,236 bytes, about 78% less. Geist Mono
  remains available but loads only when used.
- Inline production CSS with Next's `experimental.inlineCss`. This removes the
  render-blocking CSS request, which Chrome estimated cost about 1.1 seconds on
  the throttled connection. It trades larger HTML for fewer critical requests.
  Next continues managing CSS for client navigation. The tested final board makes
  no external stylesheet requests.
- Split career template components with server-rendered dynamic imports so an
  initial page does not require every template. No `ssr: false` content fallback.
- Render first-visit cookie consent in the server HTML. The previous hydration-only
  panel sometimes became a late LCP element at 5.5 seconds. The server reads only
  the consent cookie to decide initial visibility; tracking remains consent-gated.
- Stack job names and metadata on narrow screens. Verified no horizontal overflow
  at 390px. Remove public footer vendor branding and its two SVG requests.

The tested board's JS transfer remains approximately 282 KB including the new
attribution feature; the measured gains primarily come from fonts, CSS delivery
and earlier rendering rather than a claim of a large JS reduction.

Raw before/after traces and mobile screenshots are in the local OpenCode temporary
directory under `career-cold-before.json.gz`, `job-cold-before.json.gz`,
`career-final.json.gz`, `career-verified-final.json.gz`, `job-final.json.gz`
and `career-mobile-fixed.png`.

No broad page caching was introduced: published/closed jobs, configuration changes
and application availability keep their existing freshness rules.

## Banner benchmark and image delivery

After switching to the Playful template and adding a photographic banner, repeated
the same fresh-context mobile benchmark on 2026-09-16:

| Page with banner | Before LCP | After LCP | Before / after CLS |
| --- | ---: | ---: | ---: |
| Career board | 12.546 s | 2.962 s | 0.00 / 0.00 |
| Individual job listing | 12.558 s | 2.951 s | 0.00 / 0.00 |

The banner response body fell from 1,681,370 bytes of PNG to 93,334 bytes of
WebP, a 94.4% reduction. The mobile browser selected the 1200px variant.
These measurements use production page HTML/JS on port 3101; stored absolute
asset URLs point to the warmed local asset handler on port 3100 in both cases.
They do not measure production R2 latency or first-ever variant generation on
the VPS. These are single runs per page, not a field percentile or INP benchmark.

- New uploads are encoded as WebP with transparency, rather than always PNG.
- Existing uploads retain their original files and URLs. Responsive images request
  a finite set of width variants through the same public asset endpoint. Variants
  are generated on demand with Sharp and stored in the same private assets bucket
  under `public-asset-variants/v1/`. No re-upload or database migration is needed.
- Playful/Minimal banners and job banners use native responsive images with eager,
  high-priority loading. Secondary office photos and testimonial avatars load lazily.
- Unique upload URLs and versioned image variants have one-year immutable browser
  caching. Application and job responses retain their existing freshness rules.
- Public job descriptions, requirements, benefits and custom content sections are
  sanitized on the server and included in initial HTML. Live editor previews retain
  client sanitization. Script/event-handler markup and unsafe URL schemes are removed;
  rich-content images and embeds load lazily. Safe text alignment/colors are retained.

The assets credentials need read/write access for generated variants, as they already
do for uploads. If writing a variant fails, the current generated response is still
served and a later request can try persisting it again. Originals remain available.

Trace files: `banner-before.json.gz`, `banner-after.json.gz`,
`banner-job-before.json.gz`, `banner-job-after.json.gz` in the local OpenCode
temporary directory. The final mobile board had no horizontal overflow and both
banner and logo loaded successfully.
