# ![VirtualDisplayWizard](https://gitlab.prplanit.com/uploads/-/system/project/avatar/42/app.png?width=24) VirtualDisplayWizard

<!-- sf:badges:start -->[![build](https://raw.githubusercontent.com/PrPlanIT/DisplayWizard/dev-go-port/.stagefreight/scribe/build.svg)](https://gitlab.prplanit.com/PrPlanIT/DisplayWizard/-/pipelines) [![license](https://raw.githubusercontent.com/PrPlanIT/DisplayWizard/dev-go-port/.stagefreight/scribe/license.svg)](https://github.com/PrPlanIT/DisplayWizard/blob/dev-go-port/LICENSE) [![release](https://raw.githubusercontent.com/PrPlanIT/DisplayWizard/dev-go-port/.stagefreight/scribe/release.svg)](https://github.com/PrPlanIT/DisplayWizard/releases) ![updated](https://raw.githubusercontent.com/PrPlanIT/DisplayWizard/dev-go-port/.stagefreight/scribe/updated.svg) [![donate](https://img.shields.io/badge/donate-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/T6T41IT163) [![sponsor](https://img.shields.io/badge/sponsor-EA4AAA?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/PrPlanIT)<!-- sf:badges:end -->

<!-- sf:project:start -->[![GitHub](https://img.shields.io/badge/GitHub-source-181717?logo=github)](https://github.com/PrPlanIT/DisplayWizard) [![GitLab](https://img.shields.io/badge/GitLab-source-FC6D26?logo=gitlab)](https://gitlab.prplanit.com/PrPlanIT/DisplayWizard) [![Go Report Card](https://goreportcard.com/badge/github.com/PrPlanIT/DisplayWizard)](https://goreportcard.com/report/github.com/PrPlanIT/DisplayWizard) [![Last Commit](https://img.shields.io/github/last-commit/PrPlanIT/DisplayWizard)](https://github.com/PrPlanIT/DisplayWizard/commits) [![Open Issues](https://img.shields.io/github/issues/PrPlanIT/DisplayWizard)](https://github.com/PrPlanIT/DisplayWizard/issues) [![Open PRs](https://img.shields.io/github/issues-pr/PrPlanIT/DisplayWizard)](https://github.com/PrPlanIT/DisplayWizard/pulls) [![Contributors](https://img.shields.io/github/contributors/PrPlanIT/DisplayWizard)](https://github.com/PrPlanIT/DisplayWizard/graphs/contributors)<!-- sf:project:end -->

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
