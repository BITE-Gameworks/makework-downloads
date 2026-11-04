#!/usr/bin/env node
// Fetches a published MakeWork release into release-files/<version>/, verifies it and compares it with the files
// the site's src/downloads.ts links to. Needs a logged in `gh` and a makework.dev checkout next to this repo.
//
//   npm run update_downloads                     latest release
//   npm run update_downloads -- --tag v1.2.3     a specific release
//   npm run update_downloads -- --publish        also copy it to the public downloads repo, set the site's VERSION and
//                                                latest.json for its next deploy, and delete all but the newest
//                                                KEEP_VERSIONS versions
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { desktop, DOWNLOADS_REPO, servers, SOURCE_URL, VERSION } from "../../makework.dev/src/downloads.ts";

const SOURCE_REPO = new URL(SOURCE_URL).pathname.slice(1);
const VERSION_FILE = "latest.json";
const KEEP_VERSIONS = 5;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = join(root, "../makework.dev");
const filesRoot = join(root, "release-files");

const { values: args } = parseArgs({ options: { tag: { type: "string" }, publish: { type: "boolean" } } });

// "latest" never returns drafts, so a release counts once it is published on GitHub.
const endpoint = args.tag ? `releases/tags/${args.tag}` : "releases/latest";
const release = JSON.parse(execFileSync("gh", ["api", `repos/${SOURCE_REPO}/${endpoint}`], { encoding: "utf8" }));
const tag = release.tag_name;
const version = tag.replace(/^v/, "");
const folder = join(filesRoot, version);
mkdirSync(folder, { recursive: true });

const sha256 = async (path) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
};

console.log(`${tag}: ${release.assets.length} files`);
for (const asset of release.assets) {
  const path = join(folder, asset.name);
  if (existsSync(path) && (await sha256(path)) === asset.digest) {
    console.log(`  have ${asset.name}`);
    continue;
  }
  console.log(`  get  ${asset.name} (${Math.round(asset.size / 1e6)} MB)`);
  execFileSync("gh", ["release", "download", tag, "-R", SOURCE_REPO, "-p", asset.name, "-D", folder, "--clobber"], {
    stdio: "inherit",
  });
  if (asset.digest && (await sha256(path)) !== asset.digest) {
    console.error(`Checksum mismatch: ${asset.name}`);
    process.exit(1);
  }
}

const linked = [...desktop.flatMap((build) => build.files.map((f) => f.file)), ...servers.map((s) => s.file)].map((name) =>
  name.replaceAll(VERSION, version),
);
const names = release.assets.map((asset) => asset.name);
const hostable = names.filter((name) => name !== VERSION_FILE);
const missing = linked.filter((name) => !names.includes(name));
const unlinked = hostable.filter((name) => !linked.includes(name));

if (missing.length) console.log(`\nThe site links to these, but the release doesn't have them:\n  ${missing.join("\n  ")}`);
if (unlinked.length) console.log(`\nIn the release, but not linked from the site:\n  ${unlinked.join("\n  ")}`);
console.log(`\nFiles are in ${folder}`);

if (!args.publish) process.exit(0);

if (missing.length) {
  console.error("\nNot publishing: the download page would have dead links.");
  process.exit(1);
}

const hostRelease = (...command) => execFileSync("gh", ["release", ...command, "-R", DOWNLOADS_REPO], { stdio: "inherit" });
const hostedTags = () =>
  JSON.parse(
    execFileSync("gh", ["release", "list", "-R", DOWNLOADS_REPO, "--limit", "100", "--json", "tagName"], { encoding: "utf8" }),
  ).map((hosted) => hosted.tagName);

const files = hostable.map((name) => join(folder, name));
if (hostedTags().includes(tag)) {
  // Finishes a release left as a draft by an interrupted upload, too.
  hostRelease("upload", tag, ...files, "--clobber");
  hostRelease("edit", tag, "--draft=false");
} else {
  // No copied notes: the source release's generated notes describe private commits.
  hostRelease("create", tag, ...files, "--title", `MakeWork ${version}`, "--notes", "");
}

// Written only after the uploads: desktop apps offer an update as soon as latest.json names a newer version.
const downloadsFile = join(siteRoot, "src/downloads.ts");
writeFileSync(
  downloadsFile,
  readFileSync(downloadsFile, "utf8").replace(/export const VERSION = ".*";/, `export const VERSION = "${version}";`),
);
const publicFolder = join(siteRoot, "public/download");
mkdirSync(publicFolder, { recursive: true });
writeFileSync(join(publicFolder, VERSION_FILE), `${JSON.stringify({ version })}\n`);

const newestFirst = hostedTags().sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
// The version being published stays even when it is an older one, since the site is about to link to it.
for (const old of newestFirst.slice(KEEP_VERSIONS).filter((hosted) => hosted !== tag)) {
  hostRelease("delete", old, "--yes", "--cleanup-tag");
  console.log(`Deleted ${old} from ${DOWNLOADS_REPO}`);
}

const keptFolders = [...newestFirst.slice(0, KEEP_VERSIONS), tag].map((hosted) => hosted.replace(/^v/, ""));
for (const local of readdirSync(filesRoot)) {
  if (!keptFolders.includes(local)) rmSync(join(filesRoot, local), { recursive: true });
}

console.log(`\nPublished ${version} to ${DOWNLOADS_REPO}. Build and deploy the site to make it live.`);
