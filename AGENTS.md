# AGENTS.md

## Project: Musician Poster Asset & Design Platform

This project is an MVP platform for creating concert posters from performer images.

## Core Product Principle

Do not generate a full poster directly from a raw uploaded person photo.

The correct flow is:

1. Create or accept a performer asset.
2. Validate and approve the performer asset.
3. Use the approved asset as a locked poster layer.
4. Generate and edit poster layouts around the locked asset.

## Two Image Workflows

### Workflow A: Generate Asset from Source Photo

Use this when the user uploads a normal person photo.

Rules:
- Treat the photo as an identity reference.
- Create profile asset candidates.
- Preserve apparent identity.
- Preserve face direction, gaze, facial proportions, age impression, skin tone, hairline, hairstyle, eyes, nose, mouth, jawline.
- Do not create a different person.
- Require user approval before poster generation.

### Workflow B: Direct Asset Upload

Use this when the user uploads a ready-to-use performer asset.

Examples:
- Transparent PNG cutout
- Official artist photo
- Studio portrait
- Already retouched profile image
- Existing AI-generated performer asset

Rules:
- Treat the uploaded asset as the final performer image.
- Do not regenerate the person.
- Do not redraw the face.
- Do not change pose, clothing, expression, hairstyle, or instrument.
- Use the asset as a locked layer.
- Only allow non-destructive edits:
  - scale
  - crop
  - position
  - opacity
  - shadow
  - subtle color grading
  - edge blending
  - background removal or edge refinement if explicitly requested

## Poster Rules

Poster generation may modify:
- background
- typography
- text content
- layout
- color palette
- decorative shapes
- lighting overlays
- shadows
- abstract musical graphics

Poster generation must not modify:
- performer identity
- face
- pose
- expression
- hairstyle
- clothing
- instrument shown in the asset

## Text Rules

Important poster text must be editable text layers.

Do not bake important text into generated images.

Editable text includes:
- concert title
- performer name
- instrument or role
- date
- time
- venue
- program
- ticket information
- sponsors

## Safety Rules

- Require consent before processing person images.
- Require usage-rights confirmation before using uploaded assets.
- Do not identify a person from the image.
- Do not infer sensitive attributes.
- Do not implement face recognition or face embedding storage in MVP.
- Do not store biometric embeddings.
- Keep delete/remove placeholders for future retention controls.

## Engineering Rules

- Prefer existing stack and conventions.
- Keep UI, domain models, services, and persistence separated.
- Use typed domain models.
- Hide AI/image generation behind service interfaces.
- Stub external AI calls for MVP.
- Do not commit API keys.
- Add tests for locked-layer rules and edit request classification.
- Keep poster documents layer-based.
