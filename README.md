# actions-timeline

## USAGE

```yaml
- uses: Kesin11/actions-timeline
  with:
    # ex: ${{ secrets.MY_PAT }}
    # Default: ${{ github.token }}
    github-token: ''
```

## Support GHES

You can set `GITHUB_API_URL` environment variable to use this action with GHES.

```yaml
- uses: Kesin11/actions-timeline
  env:
    GITHUB_API_URL: 'https://github.example.com/api/v3'
```

# DEBUG

If you want to debug this action, you should enable soucemap using
`NODE_OPTIONS` environment variable.

```yaml
- uses: Kesin11/actions-timeline
  env:
    NODE_OPTIONS: "--enable-source-maps"
```
