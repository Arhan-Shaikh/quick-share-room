# Architecture rules

- Configure resumable uploads through `src/lib/upload-config.ts`, using the direct storage host for hosted projects and bounded network retries; large transfers must bypass the API gateway without broadening storage permissions.
- Storage-backed uploads require a path-specific signed token from `create-share-upload`, which generates fresh paths with overwrite disabled; keep direct client storage writes denied to preserve account-free isolation.