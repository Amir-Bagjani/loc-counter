#!/usr/bin/env node
/**
 * loc-counter.ts
 *
 * A small TypeScript CLI that counts lines of code in a front-end project.
 *
 * Features:
 * - Recursively scans a project directory
 * - Filters by file extensions (defaults to common front-end extensions)
 * - Skips common build / dependency folders (node_modules, .git, dist, build, etc.)
 * - Counts: total lines, non-empty lines, comment-only lines (simple heuristics)
 * - Per-extension breakdown and "largest files" list
 * - Output as human-friendly text or JSON
 *
 * Usage (quick):
 *   # with ts-node:
 *   npx ts-node loc-counter.ts /path/to/project --format json --top 10
 *
 *   # compile & run:
 *   tsc loc-counter.ts --outDir dist && node dist/loc-counter.js /path/to/project
 *
 * CLI options (simple parsing):
 *   path: positional (defaults to current working dir)
 *   --ext or --extensions : comma-separated extensions to include (without dot)
 *   --exclude : comma-separated directory names to ignore (default: node_modules,.git,dist,build,.next,out,coverage,public)
 *   --count-empty : include empty lines in "code" counts (default: false)
 *   --no-count-comments : do not try to detect comment-only lines (default: detect comments)
 *   --format : 'text' (default) or 'json'
 *   --top : number of largest files to show (default: 10)
 *
 * Notes / assumptions:
 * - Comment detection uses simple heuristics. It does a reasonable job for C-style
 *   languages (js/ts/css) and HTML-style comments, but it is not a full parser.
 * - Files without extensions are ignored.
 * - You can customize extensions and exclude directories via CLI flags.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

type Options = {
  extensions: string[]; // allowed extensions (no dot, lowercase)
  excludeDirs: string[]; // directory names to skip
  countEmpty: boolean; // whether to count empty lines as code lines
  detectComments: boolean; // whether to try to detect comment-only lines
  format: 'text' | 'json';
  top: number; // top N largest files
};

type FileStat = {
  file: string;
  ext: string;
  totalLines: number;
  nonEmptyLines: number;
  commentOnlyLines: number;
};

const DEFAULT_OPTIONS: Options = {
  extensions: ['ts', 'tsx', 'js', 'jsx', 'css', 'scss', 'sass', 'less', 'html', 'vue'],
  excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', 'public'],
  countEmpty: false,
  detectComments: true,
  format: 'text',
  top: 10,
};

function parseArgs(argv: string[]): { targetPath: string; options: Options } {
  const args = argv.slice(2);
  let targetPath = process.cwd();
  const opt: Options = { ...DEFAULT_OPTIONS };

  const popt = (s?: string) => (s ? s.split(',').map((p) => p.trim()).filter(Boolean) : []);

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a) continue;
    if (!a.startsWith('-') && i === 0) {
      targetPath = path.resolve(a);
      continue;
    }

    if (a === '--ext' || a === '--extensions') {
      const val = args[i + 1];
      if (val && !val.startsWith('--')) {
        opt.extensions = popt(val).map((e) => e.replace(/^[.]/, '').toLowerCase());
        i++;
      }
    } else if (a === '--exclude') {
      const val = args[i + 1];
      if (val && !val.startsWith('--')) {
        opt.excludeDirs = popt(val).map((d) => d);
        i++;
      }
    } else if (a === '--count-empty') {
      opt.countEmpty = true;
    } else if (a === '--no-count-comments') {
      opt.detectComments = false;
    } else if (a === '--format') {
      const val = args[i + 1];
      if (val && (val === 'json' || val === 'text')) {
        opt.format = val;
        i++;
      }
    } else if (a === '--top') {
      const val = args[i + 1];
      if (val && !isNaN(Number(val))) {
        opt.top = Math.max(0, Number(val));
        i++;
      }
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit();
    } else {
      // If it's the first non-flag arg and not processed above
      if (!a.startsWith('-')) {
        targetPath = path.resolve(a);
      }
    }
  }

  return { targetPath, options: opt };
}

function printHelpAndExit() {
  console.log(`
loc-counter - count lines of code in a frontend project

Usage:
  node loc-counter.js <path> [--ext ts,tsx,js] [--exclude node_modules,dist] [--count-empty] [--no-count-comments] [--format json] [--top 10]

Defaults:
  extensions: ${DEFAULT_OPTIONS.extensions.join(',')}
  exclude: ${DEFAULT_OPTIONS.excludeDirs.join(',')}

Example:
  npx ts-node loc-counter.ts ./my-app --ext ts,tsx,js,jsx --format json --top 5
`);
  process.exit(0);
}

function shouldExcludeDir(dirname: string, excludeList: string[]): boolean {
  return excludeList.includes(dirname);
}

function isCStyle(ext: string) {
  const s = new Set(['ts', 'tsx', 'js', 'jsx', 'css', 'scss', 'sass', 'less']);
  return s.has(ext);
}

function isHtmlLike(ext: string) {
  return ext === 'html' || ext === 'vue';
}

async function walkDir(dir: string, options: Options, fileList: string[]) {
  let entries: import('fs').Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    // permission or broken symlink - skip
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldExcludeDir(entry.name, options.excludeDirs)) continue;
      await walkDir(full, options, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase().replace(/^\./, '');
      if (!ext) continue; // ignore files without extension
      if (options.extensions.length > 0 && !options.extensions.includes(ext)) continue;
      fileList.push(full);
    }
  }
}

function analyzeTextLines(lines: string[], ext: string, detectComments: boolean) {
  const total = lines.length;
  let nonEmpty = 0;
  let commentOnly = 0;

  let withinBlock = false;
  let blockType: 'c' | 'html' | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '    ');
    const trimmed = line.trim();
    if (trimmed === '') continue;
    nonEmpty++;

    if (!detectComments) continue;

    // If we are inside a block comment, assume the line is comment-only unless we detect code after the block end
    if (withinBlock) {
      // detect end token
      if (blockType === 'c') {
        const endIdx = trimmed.indexOf('*/');
        if (endIdx === -1) {
          commentOnly++;
          continue;
        } else {
          const after = trimmed.slice(endIdx + 2).trim();
          if (after === '') {
            commentOnly++;
            withinBlock = false;
            blockType = null;
            continue;
          } else {
            withinBlock = false;
            blockType = null;
            // there is code after block end -> this line is not comment-only
            continue;
          }
        }
      } else if (blockType === 'html') {
        const endIdx = trimmed.indexOf('-->');
        if (endIdx === -1) {
          commentOnly++;
          continue;
        } else {
          const after = trimmed.slice(endIdx + 3).trim();
          if (after === '') {
            commentOnly++;
            withinBlock = false;
            blockType = null;
            continue;
          } else {
            withinBlock = false;
            blockType = null;
            continue;
          }
        }
      }
    }

    // Not inside block comment currently
    if (isCStyle(ext)) {
      if (trimmed.startsWith('//')) {
        commentOnly++;
        continue;
      }
      const sIdx = trimmed.indexOf('/*');
      if (sIdx !== -1) {
        const eIdx = trimmed.indexOf('*/', sIdx + 2);
        if (sIdx === 0) {
          // comment starts at beginning of line
          if (eIdx === -1) {
            commentOnly++;
            withinBlock = true;
            blockType = 'c';
            continue;
          } else {
            const after = trimmed.slice(eIdx + 2).trim();
            if (after === '') {
              commentOnly++;
              continue;
            } else {
              // code after block end -> this line not comment-only
            }
          }
        } else {
          // comment starts after code: not comment-only
        }
      }
    } else if (isHtmlLike(ext)) {
      if (trimmed.startsWith('<!--')) {
        const eIdx = trimmed.indexOf('-->');
        if (eIdx === -1) {
          commentOnly++;
          withinBlock = true;
          blockType = 'html';
          continue;
        } else {
          const after = trimmed.slice(eIdx + 3).trim();
          if (after === '') {
            commentOnly++;
            continue;
          }
        }
      }
    }

    // fallback: not comment-only line
  }

  return { total, nonEmpty, commentOnly };
}

async function analyzeFile(filePath: string, options: Options): Promise<FileStat | null> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    return null;
  }
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '') || 'unknown';
  const lines = content.split(/\r\n|\n|\r/);
  const { total, nonEmpty, commentOnly } = analyzeTextLines(lines, ext, options.detectComments);
  return {
    file: filePath,
    ext,
    totalLines: total,
    nonEmptyLines: nonEmpty,
    commentOnlyLines: commentOnly,
  };
}

async function run(targetPath: string, options: Options) {
  // Validate
  let stat: import('fs').Stats;
  try {
    stat = await fs.stat(targetPath);
  } catch (err) {
    console.error('Path not found:', targetPath);
    process.exit(2);
  }
  if (!stat.isDirectory()) {
    console.error('Provided path must be a directory');
    process.exit(2);
  }

  // Gather files
  const fileList: string[] = [];
  await walkDir(targetPath, options, fileList);

  const perExt = new Map<string, { files: number; totalLines: number; nonEmpty: number; comments: number }>();
  const fileStats: FileStat[] = [];

  for (const file of fileList) {
    const s = await analyzeFile(file, options);
    if (!s) continue;
    fileStats.push(s);
    const cur = perExt.get(s.ext) || { files: 0, totalLines: 0, nonEmpty: 0, comments: 0 };
    cur.files += 1;
    cur.totalLines += s.totalLines;
    cur.nonEmpty += s.nonEmptyLines;
    cur.comments += s.commentOnlyLines;
    perExt.set(s.ext, cur);
  }

  // Summaries
  const totalFiles = fileStats.length;
  const totalLines = fileStats.reduce((a, b) => a + b.totalLines, 0);
  const totalNonEmpty = fileStats.reduce((a, b) => a + b.nonEmptyLines, 0);
  const totalComments = fileStats.reduce((a, b) => a + b.commentOnlyLines, 0);

  const largest = [...fileStats].sort((a, b) => b.totalLines - a.totalLines).slice(0, options.top);

  if (options.format === 'json') {
    const out = {
      target: targetPath,
      totalFiles,
      totalLines,
      totalNonEmpty,
      totalCommentOnlyLines: totalComments,
      perExtension: Object.fromEntries(
        [...perExt.entries()].sort((a, b) => b[1].totalLines - a[1].totalLines).map(([ext, v]) => [ext, v])
      ),
      largestFiles: largest.map((f) => ({ file: f.file, lines: f.totalLines })),
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  // Text output
  console.log('LOC Counter report');
  console.log('Target:', targetPath);
  console.log('Files counted:', totalFiles);
  console.log('Total lines:', totalLines);
  console.log('Non-empty lines:', totalNonEmpty);
  console.log('Comment-only lines (heuristic):', totalComments);
  console.log('');
  console.log('Per-extension breakdown:');
  const rows = [...perExt.entries()].sort((a, b) => b[1].totalLines - a[1].totalLines);
  for (const [ext, v] of rows) {
    console.log(`  ${ext.padEnd(6)}  files:${String(v.files).padStart(5)}  lines:${String(v.totalLines).padStart(8)}  non-empty:${String(v.nonEmpty).padStart(8)}  comments:${String(v.comments).padStart(8)}`);
  }

  if (largest.length > 0) {
    console.log('\nTop largest files:');
    for (const f of largest) {
      console.log(`  ${f.totalLines.toString().padStart(6)} lines  ${f.file}`);
    }
  }
}

// entrypoint
(async function main() {
  const { targetPath, options } = parseArgs(process.argv);
  await run(targetPath, options);
})();
