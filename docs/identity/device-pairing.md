---
title: "Device Pairing (v1)"
description: ""
audience: [developers]
category: identity
---

# Device Pairing (v1)

- Clients (UI, nodes) present a device public key and sign a nonce at connect time.
- Server verifies signature, records pairing requests, and requires approval (append-only audit).
- Approved devices receive scoped tokens; scopes gate capabilities/actions.
- Unpaired devices are denied; pairing can auto-approve for local dev if explicitly enabled.
- All decisions and scope upgrades are logged with reasons and user identity when available.
