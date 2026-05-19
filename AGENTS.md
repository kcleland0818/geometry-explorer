# Repository Guidelines

This repository contains a template for building embedded applications using
the Bespoke Simulation framework. For complete template documentation, see
[BESPOKE-TEMPLATE.md](./BESPOKE-TEMPLATE.md).

## Overview

This template provides:
- CodeSignal Design System integration
- Consistent layout components (header, sidebar, main content area)
- Help modal system
- Local development server with WebSocket support
- **Composer-ready bundle**: `npm run build:module` outputs `module/` for hosts that load `/simulations/{id}/content.html`, `simulation.css`, and `simulation.js`
- Standardized file structure and naming conventions

## Quick Start

1. **Customize the HTML template** (`client/index.html`):
   - Replace `<!-- APP_TITLE -->` with your page title
   - Replace `<!-- APP_NAME -->` with your app name
   - Replace the default `<main id="standalone-sim-mount" …>` block with your layout (keep that `id` and `data-bespoke-sim-root` if you use `standalone.js` and composer hosts)
   - Keep `client/content.html` in sync with the same inner markup for `build:module`
   - Add app-specific CSS links at `<!-- APP_SPECIFIC_CSS -->`
   - Add app-specific JavaScript at `<!-- APP_SPECIFIC_SCRIPTS -->`

2. **Create your application files**:
   - App-specific CSS (e.g., `my-app.css`)
   - App-specific JavaScript (e.g., `my-app.js`); export `init(context)` from `simulation-app.js` for composer hosts
   - Help content (based on `help-content-template.html`)

3. **Composer / multi-app host** (optional):
   - Run `npm run build` for the full static app (`dist/`) and `npm run build:module` for the host bundle (`module/`)
   - Serve the module tree with `IS_PRODUCTION=true SERVE_DIR=module PORT=<port> node server.js` (each app on its own port when the host proxies `/simulations/{id}/…`)
   - Match `SIM_ID` in `client/standalone.js` to the `id` in the host’s `simulations.json`

4. **Start the development server**:
   ```bash
   npm start
   ```
   Server runs on `http://localhost:3000`

## CodeSignal Runtime Contract

- Root `config.json` is loaded through `GET /config`; task setup scripts may replace it before server startup.
- The Geometry Explorer client reads `initialState.mode`, `initialState.shape`, and `initialState.values` to initialize the app.
- The client posts current state to `POST /snapshot`; evaluators can read it with `GET /snapshot`.
- Release tarballs must include `dist/`, `package.json`, `config.json`, `server.js`, and production `node_modules/`.

## Key Conventions

### File Naming

- CSS files: kebab-case (e.g., `my-app.css`)
- JavaScript files: kebab-case (e.g., `my-app.js`)
- Data files: kebab-case (e.g., `solution.json`)
- Image files: kebab-case (e.g., `overview.png`)

### Error Handling

- Wrap all async operations in try-catch blocks
- Provide meaningful error messages to users
- Log errors to console for debugging
- Implement retry logic for network operations
- Handle localStorage quota exceeded errors
- Validate data before saving operations

## Development Workflow

### Build and Test

```bash
# Start development server
npm start

# Development mode (same as start)
npm run dev
```

### WebSocket Messaging

The server provides a `POST /message` endpoint for real-time messaging:

```bash
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Your message here"}'
```

This sends alerts to connected clients. Requires `ws` package:
```bash
npm install
```

## Template Documentation

For detailed information about:
- Design System usage and components
- CSS implementation guidelines
- JavaScript API (HelpModal)
- Component reference and examples
- Customization options

See [BESPOKE-TEMPLATE.md](./BESPOKE-TEMPLATE.md).

## Project Structure

```
client/
  ├── index.html               # Main HTML template
  ├── app.js                   # Shell: help modal + WebSocket
  ├── standalone.js            # Standalone init(context) + /api/log
  ├── simulation-app.js        # Composer entry: export init(context)
  ├── content.html             # Fragment for composer host
  ├── bespoke-simulation.css   # Styles for fragment → module/simulation.css
  ├── bespoke-template.css     # Template layout
  ├── help-content.html        # Help body HTML
  └── design-system/           # CodeSignal Design System (git submodule)
server.js                       # API + static (dist/ or module/ via SERVE_DIR)
vite.config.module.js          # build:module → module/
```

## Notes for AI Agents

When working on applications built with this template:

1. **Always reference BESPOKE-TEMPLATE.md** for template-specific
   implementation details
2. **Follow the conventions** listed above for file naming
3. **Use Design System components** directly - see BESPOKE-TEMPLATE.md for
   component classes and usage
4. **Maintain consistency** with the template's structure and patterns
5. **Keep guidelines up to date** by editing this AGENTS.md file as the codebase evolves
