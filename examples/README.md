# Geometry Explorer Config Examples

`config.json` controls the initial state of Geometry Explorer when the app starts.
CodeSignal task setup can copy a task-specific `config.json` into the project root
before running `IS_PRODUCTION=true PORT=3000 node server.js`.

The client reads this file through `GET /config`, validates it, and initializes the
simulation from it. As learners interact with the app, the browser posts the current
state to `POST /snapshot`; evaluators can read it with `GET /snapshot`.

## Basic Shape

```json
{
  "version": 1,
  "initialState": {
    "mode": "2d",
    "shape": "rectangle",
    "values": {
      "width": 8,
      "height": 5
    }
  },
  "ui": {
    "lockedMode": false,
    "lockedShape": false,
    "showFormulaHints": true
  },
  "evaluation": {}
}
```

## Top-Level Fields

- `version`: Use `1`.
- `initialState`: The shape, mode, and dimensions used when the app loads.
- `ui`: Optional controls for what the learner can change.
- `evaluation`: Optional metadata for task authors or grading scripts. The app
  stores and serves it, but does not enforce it.

## `initialState`

```json
{
  "mode": "2d",
  "shape": "rectangle",
  "values": {
    "width": 8,
    "height": 5
  }
}
```

`mode` must be one of:

- `"2d"`
- `"3d"`

`shape` must match the selected mode.

For `"2d"`:

- `"rectangle"`
- `"circle"`
- `"rightTriangle"`

For `"3d"`:

- `"prism"`
- `"cylinder"`
- `"sphere"`

## Dimensions

All current dimensions use integer slider steps. Invalid or missing values fall
back to the selected shape's defaults. Out-of-range values are clamped.

| Shape | Value keys | Range |
| --- | --- | --- |
| `rectangle` | `width`, `height` | `1` to `16` |
| `circle` | `radius` | `1` to `12` |
| `rightTriangle` | `legA`, `legB` | `1` to `14` |
| `prism` | `length`, `width`, `height` | `1` to `12` |
| `cylinder` | `radius`, `height` | `1` to `12` |
| `sphere` | `radius` | `1` to `12` |

## `ui`

```json
{
  "lockedMode": false,
  "lockedShape": false,
  "showFormulaHints": true
}
```

- `lockedMode`: When `true`, disables the 2D/3D dropdown.
- `lockedShape`: When `true`, disables the shape dropdown.
- `showFormulaHints`: When `false`, hides the note below the metric cards.

## `evaluation`

`evaluation` is free-form metadata for external graders or task generation. A
recommended structure is:

```json
{
  "evaluation": {
    "target": {
      "metric": "area",
      "value": 40
    },
    "tolerance": 0.01
  }
}
```

Metric names available in snapshots:

- 2D shapes: `perimeter`, `area`
- 3D shapes: `surfaceArea`, `volume`

For circles, the UI labels perimeter as circumference, but the snapshot metric key
is still `perimeter`.

## Snapshot Output

After the app opens, it posts the current state to `/snapshot`. A grader can read:

```sh
curl -s http://localhost:3000/snapshot
```

Example response:

```json
{
  "version": 1,
  "mode": "3d",
  "shape": "sphere",
  "values": {
    "radius": 5
  },
  "metrics": {
    "surfaceArea": 314.1592653589793,
    "volume": 523.5987755982989
  },
  "source": "client",
  "updatedAt": "2026-05-19T12:00:00.000Z"
}
```

If the learner has not opened the app yet, `GET /snapshot` returns a config-derived
fallback with `metrics: null`.

## Example Files

- `rectangle-area-config.json`: starts with a 2D rectangle.
- `cylinder-volume-config.json`: starts with a locked 3D cylinder.
- `circle-circumference-config.json`: starts with a locked circle shape and hides
  formula hints.
