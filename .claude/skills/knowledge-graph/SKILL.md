---
name: knowledge-graph
description: Maintains and queries a knowledge graph of this codebase (components, functions, routes, relationships) stored in knowledge-graph.json and knowledge-graph.md. Use whenever the user asks to update, refresh, or query the knowledge graph, or when deep codebase context is needed before making changes.
---

# Codebase Knowledge Graph

Maintain a machine-readable knowledge graph of this codebase for fast retrieval and deep context.

## Files

- `knowledge-graph.json` — canonical graph. Structure:
  - `nodes`: `{ id, type, name, path, description }` where `type` ∈ `project | component | function | route | config | ui_element`
  - `edges`: `{ from, to, relation }` where `relation` ∈ `contains | calls | serves | renders | loads | configures | handles`
- `knowledge-graph.md` — human-readable rendering of the same graph.

## Maintenance workflow

When the user asks to update/refresh the graph (or after significant code changes):

1. Re-scan the codebase: `app.py`, `static/app.js`, `templates/index.html`, `static/style.css`, config files (`pyproject.toml`, `render.yaml`, `requirements.txt`), `README.md`.
2. Diff against existing graph nodes/edges:
   - New functions/routes → add nodes + `contains`/`calls`/`serves` edges.
   - Renamed/removed items → update or delete nodes; fix dangling edges.
   - Changed behavior → update `description` fields (descriptions should state what the item does and any important constraints, e.g. limits, security, temp-file behavior).
3. Keep frontend/backend relationships current: `static/app.js` fetch calls → `route` nodes (`serves`); `templates/index.html` → `component`/`ui_element` nodes (`renders`/`loads`).
4. Rewrite `knowledge-graph.md` from the JSON so both stay in sync.
5. Update the `last_refreshed` field in the JSON.

## Query workflow

When deep context is needed:

1. Read `knowledge-graph.json`.
2. For a component question: find its `component` node, then traverse `contains` edges to functions and `calls`/`serves` edges to related routes/UI.
3. Only then read the specific source files needed — the graph tells you where to look.

## Conventions

- Node `id`: lowercase, e.g. `fn-merge-pdfs`, `route-api-combine`, `comp-frontend`, `cfg-flask`.
- Descriptions: one or two sentences, behavior-focused, mention side effects (file writes, deletions, error responses).
- Prefer updating existing nodes over re-creating the whole graph, unless the codebase was restructured.