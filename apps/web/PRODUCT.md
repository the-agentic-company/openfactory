# OpenFactory

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Baptiste uses OpenFactory to define agent teams, organize agents by project, and inspect scheduled runs and conversations.

## Product Purpose

Provide an interface over agent runtimes, with teams defined as YAML in the project. A team definition includes multiple agents, their own prompts, and reporting lines shown as an organization chart.

## Operating Context

The current application connects to a local T3 Code runtime. Existing reliability operator and daily digest schedules belong to the Mibba project. Preserve those live schedules while iterating on the team interface.

## Capabilities and Constraints

The first team demo is a reliability team, as requested. Its YAML and organization chart are editable previews; deployment, delegation execution, and synchronization of team files into live schedules remain open decisions. Demo data must be clearly distinguished from live runtime state.

## Brand Commitments

Keep the existing OpenFactory name and application identity while extending its interface.

## Interaction Preferences

Use centered modals for focused forms and details, and full pages when a task needs more room. Do not use side sheets or drawer panels for these workflows.
