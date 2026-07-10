# ArtSaurus Promo Maker

Standalone development repo for the ArtSaurus poster/profile maker screen.

This app intentionally focuses on the promo-maker flow only:

- no ArtSaurus login
- no performance database
- no Prisma
- local JSON/file storage under `.promo-maker-data` and `public/generated`
- mock image generation by default, with optional Google AI Studio, rembg, and DeepFace sidecars

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

```txt
http://localhost:3100/poster-create
```

The standalone app exposes the same UI-facing API paths used by ArtSaurus:

- `/api/reference/upload`
- `/api/performer-asset/generate`
- `/api/poster-proposals/generate`
- `/api/poster-projects`
- `/api/uploads/image`
- `/api/poster-ocr`

## Image Pipeline

Default local mode:

```env
IMAGE_GENERATION_PROVIDER=mock
CUTOUT_PROVIDER=sharp
FACE_IDENTITY_PROVIDER=local
```

Live-ish sidecar mode:

```bash
docker compose up -d rembg
docker compose --profile deepface up -d deepface
```

Then set:

```env
CUTOUT_PROVIDER=rembg
FACE_IDENTITY_PROVIDER=deepface
DEEPFACE_API_URL=http://localhost:5006
```

To use Google AI Studio for profile candidates, add `GOOGLE_AI_STUDIO_API_KEY` or `GEMINI_API_KEY`. The current product rule is still enforced: raw uploaded photos produce performer assets first, approved performer assets are locked into poster layers, and poster text remains editable.

The standalone page preserves the ArtSaurus app shell proportions:

- `page-shell`
- `workspace-layout`
- 180px sidebar
- `workspace-content`

That wrapper is important because the poster canvas scale depends on the available content width.

## Main Files

- `src/app/poster-create/page.tsx`
- `src/features/promo-maker/dev/PosterCreateDevShell.tsx`
- `src/features/promo-maker/components/ai-poster-studio.tsx`
- `src/features/promo-maker/server/*`
- `src/features/promo-maker/poster/*`
- `src/features/promo-maker/styles.css`
- `src/app/globals.css`
- `services/deepface/*`

## Integration Back To ArtSaurus

Keep UI/domain work inside `src/features/promo-maker`. When a change is stable, copy the feature changes back to the main ArtSaurus repo and wire real adapters there.
