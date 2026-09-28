'use strict';
// Checks that this computer can run the admin and publish: Node, git, the
// repository, the commit email, GitHub access, the port. Prints one line per
// check and a summary; exit code 1 if anything essential fails. Works on
// macOS, Windows and Linux.
//
//   node admin/tools/check-setup.js            (from the repo folder)
//   node admin/tools/check-setup.js --push     (also tries a dry-run push,
//                                               which asks for the GitHub
//                                               login if none is stored)
const { spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const NOREPLY = /@users\.noreply\.github\.com$/;
const results = [];
let failed = false;

function git(args) {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }) });
  return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim(), missing: r.error && r.error.code === 'ENOENT' };
}
function report(ok, name, detail, fix, optional) {
  results.push(`${ok ? 'OK  ' : optional ? 'WARN' : 'FAIL'}  ${name}${detail ? ': ' + detail : ''}${!ok && fix ? '\n      → ' + fix : ''}`);
  if (!ok && !optional) failed = true;
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

(async () => {
  const major = parseInt(process.versions.node, 10);
  report(major >= 18, 'Node.js', 'v' + process.versions.node, 'Install the LTS version from nodejs.org (18 or newer).');

  const v = git(['--version']);
  report(v.ok, 'Git', v.ok ? v.out.replace('git version ', '') : 'not found', 'Install Git (git-scm.com) and open a new window.');
  if (!v.ok) return finish();

  const inside = git(['rev-parse', '--is-inside-work-tree']);
  report(inside.ok, 'Repository', REPO, 'This folder is not a git clone. Clone it: git clone https://github.com/martinposta/portfolio.git');
  if (!inside.ok) return finish();

  const remote = git(['remote', 'get-url', 'origin']);
  report(remote.ok && /martinposta\/portfolio/.test(remote.out), 'GitHub remote', remote.out || 'none', 'git remote add origin https://github.com/martinposta/portfolio.git');

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  report(branch.out === 'main', 'Branch', branch.out, 'Publishing works only on main: git checkout main', true);

  const email = git(['config', 'user.email']);
  report(NOREPLY.test(email.out), 'Commit email', email.out || 'not set',
    'git config user.email 33331553+martinposta@users.noreply.github.com   (GitHub refuses pushes with a private address)');
  const name = git(['config', 'user.name']);
  report(!!name.out, 'Commit name', name.out || 'not set', 'git config user.name martinposta');

  const fetch = git(['fetch', '--quiet', 'origin', 'main']);
  report(fetch.ok, 'GitHub reachable', fetch.ok ? 'fetch works' : fetch.err.split('\n')[0], 'Check the internet connection.');

  if (fetch.ok) {
    const counts = git(['rev-list', '--left-right', '--count', 'HEAD...origin/main']).out.split(/\s+/).map(Number);
    report(counts[1] === 0, 'Up to date', counts[1] ? `${counts[1]} commit(s) behind GitHub` : 'yes', 'The admin pulls them itself when it opens.', true);
  }

  if (process.argv.includes('--push')) {
    // no GIT_TERMINAL_PROMPT here: the credential manager may open its login window
    const r = spawnSync('git', ['push', '--dry-run', 'origin', 'HEAD:main'], { cwd: REPO, encoding: 'utf8' });
    report(r.status === 0, 'GitHub login (push)', r.status === 0 ? 'allowed' : String(r.stderr || '').trim().split('\n').pop(),
      'Sign in when the GitHub window opens; with Git for Windows keep "Git Credential Manager" enabled.');
  }

  const dirty = git(['-c', 'core.quotepath=off', 'status', '--porcelain', '--untracked-files=all']).out.split('\n').filter(Boolean);
  report(dirty.length === 0, 'Working copy clean', dirty.length ? `${dirty.length} changed/untracked file(s): ${dirty.slice(0, 3).map((l) => l.slice(3)).join(', ')}` : 'yes',
    'Unpublished files block switching branches in the admin. Publish them or ask Claude.', true);

  try { fs.accessSync(path.join(REPO, 'site'), fs.constants.W_OK); report(true, 'site/ writable'); }
  catch (e) { report(false, 'site/ writable', e.code, 'The folder must not be read-only or inside a locked/synced location.'); }

  const inSync = /OneDrive|Dropbox|Google Drive|iCloud/i.test(REPO);
  report(!inSync, 'Not in a synced folder', inSync ? REPO : 'yes', 'Move the clone out of OneDrive/Dropbox/iCloud: sync tools fight with git over the same files.', true);

  report(await portFree(4173), 'Port 4173 free', '', 'Another admin is probably already running (close its window) or something else uses the port.', true);
  finish();
})();

function finish() {
  console.log('\nPortfolio admin — setup check\n' + results.join('\n'));
  console.log(failed ? '\nSomething essential is missing (FAIL above).' : '\nAll essential checks passed.');
  process.exitCode = failed ? 1 : 0;
}
