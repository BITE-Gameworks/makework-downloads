# MakeWork downloads

MakeWork is a free app for making things: chat, calls, tasks, docs, sheets, diagrams, designs, files and code in one workspace, synced peer to peer with no server to run. Use it alone and offline, with a few friends who sync directly with each other, or with a whole studio on nodes you host yourself. Plugins and themes let you shape it to how you work.

We are game developers and made it to spend less time on tools and more time on our games. Read more at https://makework.dev.

## What's in this repo

This is not the source code. It is an archive of release files, with one GitHub release per version:

- The desktop app for Windows, macOS and Linux
- The self-hosting parts: node, user server and TURN server

Get the current version from https://makework.dev/download. The newest 5 versions are kept here.

## Source code

We plan to release the source code at some point in the future. For now we want to develop a solid core and plugins first, before development potentially splinters into forks.

## Maintainers

`npm run update_downloads -- --publish` adds a new version here and points the site at it. It needs a logged in `gh`, Node.js 24 and a makework.dev checkout next to this repo.
