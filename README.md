# Champion's Atlas

Find your next Pokémon Champions doubles team.

A personal-first, mobile-friendly team browser that combines Pokémon and set
filters with regulation-aware result ordering. Browse without a team in mind,
find teams around a preferred core, and keep your current teams locally.

The app foundation is runnable. Team imports, filtering, ranking, local team
storage, and PWA installation are not implemented yet. See
[the product specification](docs/product-spec.md) for agreed behavior and milestones.

## Development

```sh
mise install
npm ci
npm run dev
```

Use the Node 22 environment selected by mise. `npm ci` installs Lefthook hooks.

```sh
make ci
```

This runs ESLint, Prettier verification, `svelte-check`, the production build,
and a server-rendering smoke test. `npm test` runs the smoke test after a build.
Use `npm run format` to format files and `npm run preview` to serve a built app.

## Stack

- Svelte 5, SvelteKit, strict TypeScript.
- shadcn-svelte (Vega), Tailwind CSS, locally bundled Inter font.
- ESLint with Svelte rules, Prettier with Svelte and Tailwind plugins, svelte-check.
- mise, Lefthook, GitHub Actions, Dependabot following mw-kit conventions.

ESLint and Prettier are the agreed exception to mw-kit's Biome default for
Svelte-specific support. UI components are editable under `src/lib/components/ui`.
Internal links passed to Button must use SvelteKit's `resolve()` at the call site.

Deployment is undecided; the scaffold retains SvelteKit's automatic adapter.
