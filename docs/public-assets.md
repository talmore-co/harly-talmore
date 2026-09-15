# Public images with private R2 buckets

Company logos, sidebar logos, career-page images, favicons and social-share images
upload through Harly at `/api/public/assets`. Only users with `settings:edit`
permission can upload. Harly validates and converts the image to PNG, then stores
it under a generated `public-assets/<workspace>/<uuid>.png` key.

Visitors and email clients read these images through the public Harly URL.
The read route accepts only the dedicated public-asset namespace and raster
extensions. It never reads the résumé/document bucket. No DNS changes or public
R2 domain are needed. Both R2 buckets remain private.

## Coolify configuration

Create a separate private bucket, for example `harly-assets`, in the same R2
account/jurisdiction as the existing bucket. Keep both public access options off.
Add these variables to the Harly service environments:

```dotenv
ASSETS_S3_BUCKET=harly-assets
ASSETS_S3_ACCESS_KEY_ID=<assets bucket access key>
ASSETS_S3_SECRET_ACCESS_KEY=<assets bucket secret>
```

The assets credentials need object read/write access to that bucket. If omitted,
Harly reuses the existing S3 credentials, which must then have access to both
buckets. A separate credential pair is recommended. The assets adapter reuses
`S3_ENDPOINT` and `S3_REGION`. `S3_PUBLIC_URL` remains empty.

Add the variables to the Compose environments as well as Coolify's variable list;
existing Compose resources do not pick up new variable references automatically.
The checked-in production and Coolify Compose files include the references.

Uploads pass through the application, so the assets bucket does not need browser
CORS. Retain the existing résumé bucket's upload CORS policy.

Deploy the new image and re-upload company logos and career-page images. Existing
broken URLs are not rewritten. Saving the company logo also creates an email-size
image in the assets bucket, with its own public Harly URL. Keys are unique per
upload; browsers cache images for up to one hour.

This change is limited to public branding images. Candidate photos and staff
avatars retain their existing storage behavior. Local development uses the same
public routes backed by the local uploads directory.
