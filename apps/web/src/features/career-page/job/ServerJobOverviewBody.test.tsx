import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ServerJobOverviewBody } from "./ServerJobOverviewBody";

it("includes sanitized formatted descriptions and requirements in initial HTML", () => {
  const html = renderToStaticMarkup(<ServerJobOverviewBody job={{
    description: '<p>Help build <strong>robots</strong>.</p><script>alert(1)</script>',
    requirements: '<ul><li>Clear communication</li></ul>',
    benefits: '<p>Flexible hours</p>',
  }} />);
  expect(html).toContain('<p>Help build <strong>robots</strong>.</p>');
  expect(html).toContain('<ul><li>Clear communication</li></ul>');
  expect(html).toContain('<p>Flexible hours</p>');
  expect(html).not.toContain('<script>');
});
