# 0060 — Memories can be read by person

Status: approved (owner request, 2026-09-29)

## Decision

The memories album gains an optional **Written by** filter with three choices:
both of us (default), you, and the partner's configured display name. It sits
beside the existing flower type, spot and garden-day filters and combines with
them.

A person matches:

- an entry they authored;
- a Dandelion wish they planted;
- a Peony keepsake they contributed at least one milestone to.

Nothing else changes: ordering, page bounds, cursors, the read-only contract
and the privacy scope stay as in [0018](0018-memories.md). The filter is a new
optional `p_author` argument on `memories_page`, validated to the two member
slots; any other value is rejected as an invalid query.

## Why

The owner wants to look back at the album as a personal journal as well as a
shared one. Filtering by author gives that view without a separate page or
duplicated content.
