# Account avatars

Staff profile photos stay in the configured private document-storage bucket under
`workspaces/<workspace>/images/<uuid>/<filename>`. Account uploads save a Harly
`/api/account/avatar?key=...` URL rather than a direct bucket URL.

The account page and user menu also translate previously saved storage URLs into
this read path. Existing uploaded photos do not need to be uploaded again.

The endpoint requires a signed-in member of the image's workspace and a persisted
staff profile reference. Members can view their own photo or a teammate's photo
in the active workspace. The server reads storage and returns a bounded WebP
image with private, no-store caching. It never fetches a user-supplied remote URL.
External profile-photo URLs, such as Google profile photos, retain their existing
behavior.

This endpoint serves staff avatars. Public branding uses the separate assets
bucket described in [public-assets.md](public-assets.md).
