# YouTube setup for self-hosted OpenSEO

OpenSEO uses a read-only Google OAuth grant for each YouTube channel. The grant
is stored for one OpenSEO project and one channel. A channel connected to a
second project receives a separate grant.

## Google Cloud setup

1. Open the Google Cloud project used by OpenSEO.
2. Enable the YouTube Data API v3 and the YouTube Analytics API.
3. Create a Web application OAuth client.
4. Add this redirect URI to the client:

   ```text
   https://YOUR_OPENSEO_HOST/api/youtube/oauth/callback
   ```

5. Set these values in the OpenSEO environment:

   ```text
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   BETTER_AUTH_SECRET=...
   ```

The OAuth client must allow the host name used by OpenSEO. Google may require
verification before users outside the test-user list can grant the YouTube
scopes.

## Requested scopes

OpenSEO requests:

- `youtube.readonly` for channel metadata and current totals.
- `yt-analytics.readonly` for views, likes, comments, and subscriber activity.

OpenSEO does not upload videos, edit channels, manage comments, or access
monetisation data.
