# Architecture rules

- Configure resumable uploads through `src/lib/upload-config.ts`, using the direct storage host for hosted projects and bounded network retries; large transfers must bypass the API gateway without broadening storage permissions.