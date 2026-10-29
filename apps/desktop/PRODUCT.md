# OpenFactory desktop

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Baptiste manages agents running on his own computers from one desktop application.

## Product Purpose

One Electron installation provides the interface, an OpenFactory-owned background host,
and an independent agent runtime. Each computer can execute work and connect to paired computers.

## Operating Context

This computer appears automatically. Remote computers are paired once through a link or code
over Tailscale. Closing the interface leaves the background host running.

## Capabilities and Constraints

The first prototype supports Linux desktop packaging, local factories, Codex CLI runs,
interval schedules, and manually added Tailscale hosts. T3 is not a dependency.
Automatic tailnet discovery, signed cross-platform installers, and automatic provider installation
remain future work. Electron bundles the existing web application. Browser and desktop use the same workspace
and Settings routes. Pairing and computer selection belong in Settings.

## Brand Commitments

Preserve OpenFactory's name, orange accent, dark workspace, and existing visual identity.
Use centered dialogs for pairing and focused forms.
