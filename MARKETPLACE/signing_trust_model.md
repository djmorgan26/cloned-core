# Signed Connector Distribution (Marketplace Trust Model)

## Objective
Allow users to install connectors/skill packs safely:
- verify publisher identity
- verify package integrity
- prevent tampering and supply chain attacks
- allow enterprise allowlists and policy enforcement

v1 includes local installation with signature verification.
A hosted marketplace can come later without changing trust fundamentals.

## Package types
- Connector packages (MCP servers, adapters, tool schemas)
- Skill pack packages (constitutions, pipelines, templates)

## Identity model
- Publisher has a signing key (Ed25519 recommended)
- Each package release is signed:
  - package manifest (name, version, hashes, capabilities)
  - tool schema files
  - binaries (if any) and source hashes

## Trust roots
- Workspace config maintains trusted publishers:
  - default trust roots: “Cloned Official” (you) + optionally others
  - enterprise can provide internal CA-like trust roots

## Verification process (v1)
1. Download or load package
2. Verify signature over manifest
3. Verify hashes match packaged files
4. Check policy constraints:
   - allowed publishers
   - allowed capabilities/tools
   - risk level gates
5. Install into connector directory and update registry

## Revocation and updates
- Support a revocation list (CRL-like) for publisher keys
- Support “yank” of compromised versions
- `cloned doctor` checks for revoked/compromised packages

## Minimal file formats (v1)
- `publisher.json` (publisher_id, public_key, metadata)
- `package.manifest.json` (id, version, files+hashes, capabilities, tools)
- `package.sig` (signature of manifest hash)
