# Data Source Policies (Access and Restriction)

Goals
- Allow users to connect many sources while restricting agents to approved datasets.
- Make source access auditable and reversible.

Concepts
- Source connector: an MCP package that exposes tools for read/write against a dataset (e.g., Google Drive, S3, case law DB).
- Source label: a canonical identifier for a dataset or collection (e.g., `org.docs.engineering`, `legal.case.law.gov`).

Policy expression
- Use capability and tool allowlists in policy packs to restrict access by source:
  - `allowlists.capabilities` includes only capabilities for approved sources.
  - `allowlists.tools` lists specific read/write tools bound to a source.
- Connector/tool manifests include `provides_capabilities` that encode source identity (e.g., `cap.data.legal.case_law:read`).
- Egress allowlists restrict hosts to the source’s domains/APIs.

Runtime enforcement
- Tool dispatch requires both: capability allowed AND egress host allowed.
- Agent/skill scope can be constrained to a subset of sources at run time (blueprint or run-level policy overlay).

Provenance
- Artifact manifests record which sources (by label) contributed to outputs.
- Audit entries include source labels in the policy decision context.

Blueprint UX
- During onboarding, user selects which sources to include; the engine produces a plan with explicit source constraints.

