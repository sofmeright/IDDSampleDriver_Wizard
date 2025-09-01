# Virtual Display Wizard — Clean Starter

## Prereqs
- Node 20+ with Corepack (pnpm)
- Go 1.22+ (optional)
- Windows packaging done via Linux CI using electronuserland/builder:wine

## Local dev
```bash
corepack enable
corepack prepare pnpm@9 --activate
pnpm install

# web dev server
pnpm -C apps/web dev

# desktop (loads :5173 in dev)
pnpm -C apps/desktop dev
ELECTRON_DEV=1 pnpm -C apps/desktop dev  # ensure it targets the dev server
```

## Build (local)
```bash
pnpm -C apps/web build
pnpm -C apps/desktop build
# package exe (from apps/desktop)
cd apps/desktop
npx electron-builder --win portable -c.extraResources='[{"from":"../web/dist","to":"ui"}]'
```

## CI
See .gitlab-ci.yml — three stages: install → build-web → package-desktop
