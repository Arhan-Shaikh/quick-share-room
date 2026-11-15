# Restrict uploads to file-specific permissions

## Selected issue
The upload rule allows anyone to add files to the private sharing bucket. It does not let them read, overwrite, or delete existing files, but it grants broader upload access than necessary.

## Proposed fix
- Preserve sharing without accounts, the existing size limit, encryption choices, and resumable uploads.
- Give each upload a temporary permission valid only for a new, randomly assigned file location.
- Remove the rule allowing unrestricted direct uploads after the new flow has been tested.
- Leave every other security finding unchanged.

## Approval needed
This changes how every storage-backed file is uploaded. Removing the old rule before the updated website is published would stop file uploads from the published version and already-open pages. Coordinate that removal with publication of the updated website; people using old pages will need to refresh. Text sharing and retrieving existing shares remain unchanged.

## Technical details
1. Add an intentionally account-free `create-share-upload` edge function. Validate the room code, file name, index and declared size; generate the object path server-side, never accept an arbitrary target path, and create an expiring signed upload token with overwrite disabled.
2. Update the upload client to request that token and send it as `x-signature` with tus uploads, retaining the direct storage hostname, six-megabyte chunks and bounded retries. Keep signing credentials server-side.
3. Test signed uploads while the old policy still exists, including upload interruption recovery and retrieval in a separate browser.
4. Publish the updated client with approval, then remove only `Anon can upload to shared-files` through a migration. There will be no client INSERT, SELECT, UPDATE or DELETE policies for that bucket.
5. Verify direct uploads without a token are rejected, tokens cannot target another path or overwrite a file, and legitimate multipart uploads still succeed after policy removal.
6. Record the upload architecture in `AGENTS.md`. Mark only the selected finding fixed after the new permissions are applied and verified.

## Current status
**Fixed:** 0 issues
**Remaining:** 1 selected issue, awaiting approval of the upload-flow change.
**Summary:** The selected issue has not yet been fixed. Re-scan after implementation to review more in depth and find potentially more issues. The security agent finds the most common security issues but does not have the tools to perform advanced penetration testing.
