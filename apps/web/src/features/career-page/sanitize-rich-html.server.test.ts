import { describe, expect, it } from "vitest";
import { sanitizeRichHtml } from "./sanitize-rich-html.server";

describe("published rich content", () => {
  it("removes executable markup, handlers, unsafe links and CSS", () => {
    const html = sanitizeRichHtml('<script>alert(1)</script><svg onload="alert(1)"></svg><img src="javascript:alert(1)" onerror="alert(1)"><a href="data:text/html,test">link</a><p style="background-image:url(https://example.com/tracker);text-align:center">Role</p><iframe srcdoc="<script>alert(1)</script>" src="javascript:alert(1)"></iframe>');
    expect(html).not.toMatch(/<script|<svg|onerror|onload|javascript:|data:text|srcdoc|background-image/);
    expect(html).toContain('text-align:center');
  });

  it("preserves readable formatting and safe media with deferred loading", () => {
    const html = sanitizeRichHtml('<h2>Role</h2><ul><li><strong>Experience</strong></li></ul><a target="_blank" href="https://example.com">Details</a><img src="https://example.com/photo.webp" width="640" height="360"><iframe src="https://www.youtube.com/embed/test"></iframe>');
    expect(html).toContain('<h2>Role</h2>');
    expect(html).toContain('<strong>Experience</strong>');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="640" height="360"');
    expect(html).toContain('sandbox="allow-scripts allow-presentation"');
  });
});
