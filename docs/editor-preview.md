# Editor preview viewport

The shared PreviewFrame renders React content into an isolated iframe document. Mobile uses a 390×844 viewport; desktop uses a 1280px-wide viewport. Scaling fits the preview into the editor without changing its media-query width. Stylesheets, inline styles and font classes are copied from the editor document and kept in sync during development. Synchronization preserves unchanged stylesheet nodes and ignores dropdown scroll-lock styles, so opening editor menus does not rebuild the preview styles.

The job editor still renders the current unsaved draft through the same public JobChrome/JobOverviewBody components. Preview links remain inert. Client, approval date and scorecard settings are internal and are not included in the public preview. There is only one preview, on the right of the editor.
