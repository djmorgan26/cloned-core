---
title: "Cost Model"
description: ""
audience: [developers]
category: cost
---

# Cost Model

Categories
- `api_requests`: request-count or payload-based API costs
- `cloud_compute`: compute-minutes or credits
- `content_publish`: irreversible publish actions (videos, posts)
- `storage`: persisted storage growth

Estimation
- Tool declares estimator: constant cap, function of payload, or unknown
- Unknown estimators require approval by policy

Budgets
- Defined per category with period windows (hour/day/week/month)
- Runtime simulates and enforces before dispatch

