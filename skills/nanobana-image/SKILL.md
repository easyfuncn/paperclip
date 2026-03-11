---
name: nanobana-image
description: >
  Call Nanobana API to generate images for content (e.g. thumbnails, illustrations).
  Use when the task requires creating or suggesting images for articles, social posts, or marketing assets.
tags: [media, image, researcher]
---

# Nanobana Image Skill

Use this skill when you need to generate or request images for content (thumbnails, illustrations, social cards). The Nanobana API is used to create images from text or briefs.

## When to use

- Task asks for "配图" (illustrations), cover images, or thumbnails.
- Content brief includes image requirements (size, style, subject).
- Marketing or social content needs generated visuals.

## Configuration

- **Endpoint and auth**: Configure via environment or adapter config. Typical env vars: `NANOBANA_API_URL`, `NANOBANA_API_KEY` (or equivalent). If not set, document in task comment that Nanobana must be configured.
- **Parameters**: Common options include prompt/text, aspect ratio, style. Refer to Nanobana API docs when available; until then, use placeholder params (e.g. `prompt`, `width`, `height`) and note in comments that actual API shape may differ.

## Steps

1. **From Paperclip**: Take the task description and any image brief (size, style, subject) from the issue or comments.
2. **Build request**: Form the image generation request (prompt + optional params) from the brief. If API docs are available, follow them; otherwise use a minimal payload and note "Nanobana API spec TBD" in the task comment.
3. **Call Nanobana**: Send the request to the configured endpoint with auth. On success, obtain the image URL or asset reference.
4. **Deliver**: Post a comment on the task with the result (e.g. image URL, file path, or "pending API configuration" if not yet set up). Update task status if the deliverable is complete.

## Collaboration

- Do not publish or attach images to external platforms unless the task explicitly asks for it; prefer delivering links or references in Paperclip task comments.
- If Nanobana is not configured, add a clear task comment so the board or CMO can add credentials or switch to another provider.
