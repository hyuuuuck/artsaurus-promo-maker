# ArtSaurus Promo Maker

Standalone development repo for the ArtSaurus poster creation screen.

This app intentionally focuses on the poster creation flow only:

- no ArtSaurus login
- no performance database
- no Prisma
- no production storage
- mock asset/proposal/save/export flow by default

## Development

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3100/poster-create
```

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
- `src/features/promo-maker/styles.css`
- `src/app/globals.css`

## Integration Back To ArtSaurus

Keep UI/domain work inside `src/features/promo-maker`. When a change is stable, copy the feature changes back to the main ArtSaurus repo and wire real adapters there.
