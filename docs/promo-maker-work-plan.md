# Promo Maker Work Plan

## Product Scope

This standalone repo focuses on the ArtSaurus poster and pamphlet maker for small musicians, performers, ensembles, and concert operators.

Business-network cover outputs are out of scope. Do not reintroduce cover documents, presets, UI entries, or conversion helpers for that channel unless product scope changes explicitly.

## Target User Flow

1. Prepare source material.
   - Upload performer reference photos, or upload an existing poster for OCR-based editing.
   - Confirm person-image processing consent and usage rights.
2. Generate and choose performer profile candidates.
   - Build several role-based candidates from the approved source asset.
   - Preserve apparent identity and face direction.
   - Let the user pick the candidate that best fits the concert.
3. Generate and choose poster proposals.
   - Use the approved profile candidate as a locked performer layer.
   - Keep important text editable.
   - Generate only the requested number of proposals.
4. Make simple edits and export.
   - Allow text, QR, position, color, crop, and basic layout edits.
   - Preserve locked performer identity rules.
5. Convert to 2-fold pamphlet and Instagram formats.
   - Keep poster layers editable where possible.
   - Preserve image ratio and clipping rules.

Existing poster editing is a separate flow:

1. Upload existing poster.
2. Run OCR.
3. Convert recognized text into editable layers with cover patches.
4. Edit and export.

## Implementation Phases

### Phase 1: Flow Clarity

- Keep the primary guided flow visible: source material -> profile -> proposal -> poster -> edit/export.
- Expose one primary next action per state.
- Make profile candidates visually and verbally distinct from poster proposals.
- Add direct card actions for saved assets and generated candidates.
- Show failure reasons in user language.

### Phase 2: Component Boundaries

Split the large AI poster studio into focused components:

- `GuidedFlowPanel`
- `StartModePanel`
- `PerformanceInfoForm`
- `PosterImportStep`
- `ReferencePhotoStep`
- `ProfileCandidateStep`
- `AssetPreviewPanel`
- `PosterProposalStep`
- `SimplePosterEditor`
- `GenerationStatusPanel`
- `RecentWorksPanel`

API calls and mutation-heavy workflow logic should move into hooks or services after the visual components are separated.

### Phase 3: Explicit Workflow State

Introduce a typed workflow state model:

- `idle`
- `source_uploaded`
- `asset_generating`
- `asset_ready`
- `profile_generating`
- `profile_candidate_selected`
- `profile_approved`
- `poster_generating`
- `poster_selected`
- `editing`
- `exported`
- `failed`

Every disabled button should be explainable from this state.

### Phase 4: AI Pipeline Reliability

- Keep role-based profile candidate slots.
- Support proposal counts without hardcoded UI leaks into unrelated panels.
- Use DeepFace/Gemini/local identity checks as filters, not as stored biometric identity.
- Provide a photo-poster fallback when cutout quality is poor.
- Avoid repeated cutout paste-ups across poster proposals.

### Phase 5: Editing and Export

- Ensure proposal cards open editable poster documents.
- Keep performer asset layers locked for identity and face edits.
- Keep title, performer, date, venue, program, tickets, sponsors, and QR labels editable.
- Keep upload poster background locked by default.
- Make OCR conversion a first-class existing-poster editing flow.

### Phase 6: Validation

Required verification gates:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

Recommended tests:

- Locked performer layer policy.
- Proposal count accuracy.
- Profile candidate slot prompt builder.
- Cutout failure fallback.
- OCR to editable text layer conversion.
- PNG export smoke test.
