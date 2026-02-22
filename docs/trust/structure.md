---
title: "Trust Store Structure (Workspace)"
description: ""
audience: [developers]
category: trust
---

# Trust Store Structure (Workspace)

Directory
- `.cloned/trust/publishers/` — one JSON file per publisher: `{publisher_id}.json`
- `.cloned/trust/revocations.json` — list of revoked publisher keys and yanked versions

Publisher File (`publisher.json`)
- `publisher_id`, `public_key`, `name`, `url`, `verified_at`

Verification Flow
1) Load publisher public key(s)
2) Verify `package.manifest.json` signature using Ed25519
3) Verify file hashes
4) Check revocations and policy allowlists
5) Ensure connector is executed out-of-process with isolation per runtime policy

Enterprise Overrides
- Additional trust roots may be added under the same directory and referenced by policy packs
