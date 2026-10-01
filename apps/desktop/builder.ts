// Main-process Builder adapter: turns the Studio project into a portable SDK
// project folder (clementina.yaml, one JSON file per asset, and for a new
// folder a starter assembly program), and reads such folders back. All
// validation, encoding and assembly belongs to the SDK.
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildProject, planAssetBuild } from '@clementina/build';
import {
  assetPaths,
  checkProject,
  fromStudioProjectV2,
  toStudioProjectV2,
  type ClementinaProjectManifest,
  type PortableProject,
  type ProjectAssetsBuild,
} from '@clementina/project';
import { loadProject, saveProject } from '@clementina/project/node';
import { validateProject, type StudioProject } from '../../packages/assets/index.js';

// A new folder's program loads at LOAD_ADDRESS and may use RAM up to RAM_END;
// link.cfg's RAM area and the manifest's loadAddress both come from these.
const LOAD_ADDRESS = 0x1800,
  RAM_END = 0x8000;
const hex = (n: number) => '$' + n.toString(16).toUpperCase();

/** A new folder's src/main.s: an empty game loop that includes the built assets. */
const STARTER_MAIN = `.setcpu "65C02"
.include "assets.inc"
.export game_start
.segment "CODE"
game_start:
 ; Add Load, DrawScreen and the other runtime calls here.
 jmp game_start
`;
/** A new folder's link.cfg: zero page, then the program and its data in RAM. */
const STARTER_LINK_CFG = `MEMORY { ZP: start=$40, size=$B0, type=rw; RAM: start=${hex(LOAD_ADDRESS)}, size=${hex(RAM_END - LOAD_ADDRESS)}, type=rw, file=%O; }
SEGMENTS { ZEROPAGE: load=ZP, type=zp; CODE: load=RAM, type=ro; RODATA: load=RAM, type=ro; DATA: load=RAM, type=rw; BSS: load=RAM, type=bss, define=yes; }
`;

/** A new folder's clementina.yaml, before its asset lists are filled in. */
function starterManifest(name: string): ClementinaProjectManifest {
  return {
    format: 'clementina-project',
    version: 1,
    name: name || 'Game',
    target: { machine: 'clementina-6502' },
    program: { kind: 'assembly', entry: 'src/main.s' },
    assets: {
      palettes: [],
      paletteConfigs: [],
      tilesets: [],
      backgrounds: [],
      overlays: [],
      shapes: [],
      animations: [],
    },
    build: {
      outputDirectory: 'build',
      assembly: {
        linkerConfig: 'link.cfg',
        outputName: 'game',
        loadAddress: LOAD_ADDRESS,
        entrySymbol: 'game_start',
      },
    },
  };
}

/** An error listing the SDK's diagnostics, one per line; `located` adds where each is. */
function diagnosticsError(
  diagnostics: { source?: string; path?: string; message: string }[],
  located = false,
) {
  return Error(
    diagnostics
      .map((d) => (located ? `${d.source ?? ''}${d.path}: ${d.message}` : d.message))
      .join('\n'),
  );
}

/** The Builder's settings for a project that has none yet. */
export const defaultAssets = (): ProjectAssetsBuild => ({
  folder: 'ASSETS',
  checks: true,
  slots: [],
  include: [],
});
/**
 * Why a folder is written: 'builder' is the Builder's Save, Build or Run, which
 * may start a new folder and always records the Builder's settings; 'save' is
 * File > Save into an opened folder, which records them only when the folder
 * already has some or they differ from the defaults.
 */
type WriteMode = 'builder' | 'save';

/**
 * The portable project for `studio`: `existing`'s manifest with its asset
 * lists replaced (keeping each asset's file path), or a starter manifest.
 */
function portableBuilderProject(
  studio: StudioProject,
  settings: ProjectAssetsBuild,
  name: string,
  existing?: PortableProject,
  mode: WriteMode = 'builder',
) {
  const assets = fromStudioProjectV2(studio);
  const manifest = existing ? structuredClone(existing.manifest) : starterManifest(name);
  for (const [kind, list] of Object.entries(assets)) {
    const key = kind as keyof typeof assets;
    // An older folder with no audio lists doesn't gain empty ones.
    if (
      existing &&
      (key === 'instruments' || key === 'sounds' || key === 'songs') &&
      !list.length &&
      !Object.prototype.hasOwnProperty.call(existing.manifest.assets, key)
    )
      continue;
    const paths = new Map(
      (existing?.assets[key] ?? []).map((asset, index) => [
        asset.id,
        assetPaths(existing!.manifest, key)[index],
      ]),
    );
    manifest.assets[key] = (list as Array<{ id: string }>).map(
      (a) => paths.get(a.id) ?? `assets/${kind}/${encodeURIComponent(a.id)}.json`,
    );
  }
  if (
    manifest.build &&
    (mode === 'builder' ||
      manifest.build.assets ||
      JSON.stringify(settings) !== JSON.stringify(defaultAssets()))
  )
    manifest.build.assets = structuredClone(settings);
  return { manifest, assets };
}
/**
 * What the Builder would build, without writing anything: the SDK's plan (or
 * its diagnostics) and a catalog of the assets a slot can name.
 */
export function inspectBuilder(studio: StudioProject, settings: ProjectAssetsBuild, name: string) {
  const project = portableBuilderProject(studio, settings, name);
  const checked = checkProject(project);
  // Slot kind to asset list; 'sprites' are the tilesets some shape draws from.
  const catalog = Object.entries({
    paletteConfig: 'paletteConfigs',
    tileset: 'tilesets',
    background: 'backgrounds',
    overlay: 'overlays',
    sprites: 'tilesets',
    song: 'songs',
    sound: 'sounds',
  } as const).flatMap(([kind, key]) =>
    project.assets[key]
      .filter((a) => kind !== 'sprites' || project.assets.shapes.some((s) => s.tilesetId === a.id))
      .map((a) => ({ kind, id: a.id, name: a.name })),
  );
  const planned = checked.ok ? planAssetBuild(project) : checked;
  return { ...planned, catalog };
}
/** The Builder's view of a chosen folder: fresh when empty, else its project and settings. */
export async function readBuilderFolder(root: string) {
  const files = await readdir(root);
  if (!files.length) return { settings: defaultAssets(), fresh: true };
  const opened = await readPortableStudioProject(root);
  if (!opened.portable.manifest.build?.assembly)
    throw Error('Choose an assembly project, or an empty folder for a new one.');
  return {
    settings: opened.project.builder ?? defaultAssets(),
    fresh: false,
    project: opened.project,
    name: opened.portable.manifest.name,
  };
}
/** Opens a portable project folder as a Studio project, with its Builder settings. */
export async function readPortableStudioProject(root: string) {
  const loaded = await loadProject(root);
  if (!loaded.ok) throw diagnosticsError(loaded.diagnostics, true);
  const portable = loaded.value;
  const project: StudioProject = {
    ...toStudioProjectV2(portable.assets),
    builder: structuredClone(portable.manifest.build?.assets ?? defaultAssets()),
  };
  validateProject(project);
  return { portable, project };
}
/** An asset the folder's clementina.yaml lists but the Studio project doesn't hold. */
export type RemovedAsset = { kind: string; id: string; name: string };
/** Whether a save may take these assets out of clementina.yaml. Their files stay in the folder. */
export type ConfirmRemoval = (removed: RemovedAsset[]) => boolean | Promise<boolean>;
/** Studio writes only the assets it holds, so a save drops every other asset the folder lists. */
function assetsRemovedBySave(existing: PortableProject, project: PortableProject): RemovedAsset[] {
  return (Object.keys(existing.assets) as Array<keyof PortableProject['assets']>).flatMap(
    (kind) => {
      const kept = new Set((project.assets[kind] ?? []).map((a) => a.id));
      return (existing.assets[kind] ?? [])
        .filter((a) => !kept.has(a.id))
        .map((a) => ({ kind, id: a.id, name: a.name }));
    },
  );
}
/** Writes an existing portable folder, preserving paths and program files. */
export async function writePortableStudioProject(
  root: string,
  studio: StudioProject,
  settings: ProjectAssetsBuild,
  name: string,
  confirmRemoval: ConfirmRemoval = () => false,
) {
  return writeStudioProject(root, studio, settings, name, confirmRemoval, 'save');
}
/** Writes the folder, or returns undefined when a save would remove assets and confirmRemoval declines. */
export async function writeBuilderProject(
  root: string,
  studio: StudioProject,
  settings: ProjectAssetsBuild,
  name: string,
  confirmRemoval: ConfirmRemoval = () => false,
) {
  return writeStudioProject(root, studio, settings, name, confirmRemoval, 'builder');
}
/**
 * Writes `studio` into the folder at `root`. Only the Builder may start a new
 * folder, which must be empty and gets the starter program; it may write only
 * into an existing folder that builds assembly.
 */
async function writeStudioProject(
  root: string,
  studio: StudioProject,
  settings: ProjectAssetsBuild,
  name: string,
  confirmRemoval: ConfirmRemoval,
  mode: WriteMode,
) {
  let existing: PortableProject | undefined;
  try {
    await readFile(join(root, 'clementina.yaml'));
    const loaded = await loadProject(root);
    if (!loaded.ok) throw diagnosticsError(loaded.diagnostics);
    existing = loaded.value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!existing && mode === 'save') throw Error('Open a portable project before saving it.');
  if (existing && mode === 'builder' && !existing.manifest.build?.assembly)
    throw Error('Builder needs a portable assembly project with build.assembly settings.');
  const project = portableBuilderProject(studio, settings, name, existing, mode);
  // Check before asking, so a save that can't happen never asks.
  const checked = checkProject(project);
  if (!checked.ok) throw diagnosticsError(checked.diagnostics);
  if (existing) {
    const removed = assetsRemovedBySave(existing, project);
    if (removed.length && !(await confirmRemoval(removed))) return undefined;
  } else {
    if ((await readdir(root)).length) throw Error('A new portable project needs an empty folder.');
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src/main.s'), STARTER_MAIN, { flag: 'wx' });
    await writeFile(join(root, 'link.cfg'), STARTER_LINK_CFG, { flag: 'wx' });
  }
  await saveProject(root, project);
  return project;
}
/** Saves, then builds. Returns undefined when the save was declined. */
export async function buildStudioProject(
  root: string,
  studio: StudioProject,
  settings: ProjectAssetsBuild,
  name: string,
  confirmRemoval?: ConfirmRemoval,
) {
  if (!(await writeBuilderProject(root, studio, settings, name, confirmRemoval))) return undefined;
  return buildProject(root);
}
