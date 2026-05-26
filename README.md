# Geometry Explorer (Bespoke Template)

Interactive geometry activity built on the Bespoke Simulation template. Explore 2D and 3D shapes, adjust dimensions with sliders, and see perimeter, area, surface area, and volume update live.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- Git

### Clone the repository

`client/design-system/` is a **Git submodule** (a separate repo linked into this one). A normal clone does **not** download those files. If you skip the steps below, Vite will fail with an error like:

```text
Failed to resolve import "./design-system/components/numeric-slider/numeric-slider.js"
```
It is recommended to clone like this:

```text
git clone --recurse-submodules https://github.com/kcleland0818/geometry-explorer.git
cd geometry-explorer
```

If you already cloned, then initialize the submodules:

```text
git submodule update --init --recursive
```

And then confirm they are there by running this command:

```text
ls client/design-system/components/numeric-slider/numeric-slider.js
```

### Install and Run Locally

```text
npm install
npm run start:dev
```

You can then see the application running on `localhost:3000`.