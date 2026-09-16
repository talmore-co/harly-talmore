# Assistant appearance

Users can choose Maya or Leo under Account → Assistant appearance. Maya is the
default. The preference saves automatically to the signed-in user's account
and applies across devices and workspaces.

The selected portrait and name appear in the dashboard greeting, floating chat
launcher, chat header, welcome screen and assistant replies. The floating
launcher is available when workspace AI is configured. Both personas have the
same tools and permissions. They identify as fictional AI assistants.

The production portraits are optimized WebP files in
`apps/web/public/images/system-persona/`. Maya uses the selected F2 portrait;
Leo uses M1. Original generation options remain local design assets.

## Deploying

Run migration `0149_overjoyed_doctor_doom` before starting the updated app. It
adds the nullable `user.assistant_persona` text column. Null or unrecognized
values display Maya. No new environment variables are required.

The migration is additive. When rolling back the app image, retain the added
column and its migration tracking record.
