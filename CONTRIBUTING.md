# Contributing to ZIMT CLI

Thanks for your interest. Here's how to get involved.

## Reporting bugs and ideas

Open an issue using the provided templates. No PR needed — feedback is welcome.

## Submitting a PR

1. Fork the repo
2. Create a branch from `develop` (not `main`)
3. Make your changes and run `npm test` + `npm run build`
4. Open a PR targeting `develop`

All PRs require at least one maintainer approval and green CI before merge.
Direct pushes to `main` and `develop` are not accepted from external contributors.

## Local setup

```sh
git clone https://github.com/Alexander-Lucens/zimt-cli.git
cd zimt-cli
npm install
npm run build
npm test
```
