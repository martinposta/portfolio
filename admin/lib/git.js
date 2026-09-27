'use strict';
// Git plumbing for the admin: every copy of the admin (Mac, Windows, Proxmox)
// edits its own clone, and GitHub's `main` is the one place they meet.
//
// The rules that keep two copies from overwriting each other:
//   - on start, fetch and fast-forward if this copy is simply behind;
//   - right before every publish, fetch again and refuse if origin/main has
//     moved since, so an edit made elsewhere in the meantime is never
//     silently replaced;
//   - a publish is commit + push in one step, so there is nothing to
//     "remember to push" before moving to another machine.
//
// Only built-ins: this runs the git binary, so git has to be installed.

const { execFileSync } = require('child_process');

const BRANCH = 'main';
const REMOTE = 'origin';
const PATHS = ['site', 'content'];           // what a publish may commit

// The GitHub account keeps its email private and blocks any push whose
// commits carry the real address (GH007). Commits must use the noreply one.
const NOREPLY = /@users\.noreply\.github\.com$/;

class GitError extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;                        // 'moved' | 'diverged' | 'branch' | 'nogit' | 'push' | 'git'
    this.details = details || {};
  }
}

function makeGit(repoDir) {
  function run(args, opts) {
    try {
      const out = execFileSync('git', args, {
        cwd: repoDir, encoding: 'utf8', timeout: (opts && opts.timeout) || 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
      });
      // porcelain status lines start with a space (" M file"); trimming the
      // whole output ate it and shifted the first path by one character
      return opts && opts.raw ? out.replace(/\n+$/, '') : out.trim();
    } catch (e) {
      if (opts && opts.allowFail) return null;
      const msg = ((e.stderr || '') + '').trim() || e.message;
      throw new GitError(msg, e.code === 'ENOENT' ? 'nogit' : 'git');
    }
  }

  // Fetch errors are not fatal: offline, the admin still edits and commits
  // locally, it just cannot promise that nobody else published meanwhile.
  function fetch() {
    try { run(['fetch', '--quiet', REMOTE, BRANCH], { timeout: 20000 }); return null; }
    catch (e) { return e.message; }
  }

  function state(opts) {
    const fetchError = opts && opts.fetch ? fetch() : null;
    const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
    const head = run(['rev-parse', '--short', 'HEAD']);
    const upstream = REMOTE + '/' + BRANCH;
    const counts = run(['rev-list', '--left-right', '--count', 'HEAD...' + upstream], { allowFail: true });
    const [ahead, behind] = counts ? counts.split(/\s+/).map(Number) : [0, 0];
    const dirty = run(['status', '--porcelain', '--untracked-files=all', '--', ...PATHS], { raw: true })
      .split('\n').filter(Boolean).map((l) => l.slice(3));
    const incoming = behind
      ? run(['log', '--format=%h %s', 'HEAD..' + upstream]).split('\n').filter(Boolean)
      : [];
    const remoteHead = run(['rev-parse', '--short', upstream], { allowFail: true });
    const remoteWhen = run(['log', '-1', '--format=%cr', upstream], { allowFail: true });
    const email = run(['config', 'user.email'], { allowFail: true }) || '';
    return { branch, head, ahead, behind, dirty, incoming, remoteHead, remoteWhen, offline: !!fetchError, fetchError,
      email, emailOk: NOREPLY.test(email) };
  }

  // Called when the admin opens. Fast-forwards when this copy is only behind;
  // anything else is reported, never resolved automatically.
  function sync() {
    let s = state({ fetch: true });
    if (s.branch !== BRANCH) return Object.assign(s, { problem: 'branch' });
    if (s.behind && s.ahead) return Object.assign(s, { problem: 'diverged' });
    let pulled = [];
    if (s.behind) {
      pulled = s.incoming;
      const ok = run(['merge', '--ff-only', '--quiet', REMOTE + '/' + BRANCH], { allowFail: true });
      if (ok === null) return Object.assign(s, { problem: 'pull' });
      s = state();
    }
    return Object.assign(s, { pulled });
  }

  // write() puts the new files on disk; it only runs once the remote check
  // has passed, so a refused publish leaves the working tree untouched.
  function publish({ message, expectHead, write }) {
    const s = state({ fetch: true });
    if (s.branch !== BRANCH) throw new GitError(`This copy is on branch "${s.branch}", not ${BRANCH}.`, 'branch');
    if (expectHead && expectHead !== s.head) {
      throw new GitError('This copy changed since the page was loaded (a publish from another tab?). Reload before publishing.', 'moved', s);
    }
    if (!s.emailOk) {
      throw new GitError(`Commits from this copy would carry "${s.email || 'no email'}", and GitHub refuses pushes that expose a private address. Run in the repo folder: git config user.email <id>+<login>@users.noreply.github.com (see CLAUDE.md).`, 'email', s);
    }
    if (s.behind) {
      throw new GitError(`${BRANCH} on GitHub moved while you were editing (${s.remoteHead}, ${s.remoteWhen}). Nothing was written.`, 'moved', s);
    }
    write();
    run(['add', '-A', '--', ...PATHS]);
    const staged = run(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
    let commit = null;
    if (staged.length) {
      run(['commit', '--quiet', '-m', message || 'Update portfolio']);
      commit = run(['rev-parse', '--short', 'HEAD']);
    }
    const pushed = push();
    return { commit, files: staged, pushed: pushed === null, pushError: pushed, offline: s.offline };
  }

  // Returns null on success, the error text otherwise. A failed push keeps
  // the commit locally; the next publish (or "retry") pushes it along.
  function push() {
    try { run(['push', '--quiet', REMOTE, BRANCH], { timeout: 60000 }); return null; }
    catch (e) {
      if (/GH007|private email/i.test(e.message)) return 'GitHub refused the push because a commit carries a private email address (GH007). Set the noreply address with git config user.email (see CLAUDE.md), then amend the waiting commit.';
      return e.message;
    }
  }

  // Branches this admin can switch to: only those whose own admin has this
  // switcher. The admin's pages are served from the checked-out files, so a
  // branch without it (the old redesign has no admin at all, an older
  // feature branch has no switcher) would leave no way to switch back.
  function branches() {
    fetch();
    const current = run(['rev-parse', '--abbrev-ref', 'HEAD']);
    const refs = run(['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes/' + REMOTE])
      .split('\n').filter(Boolean).filter((r) => r !== REMOTE + '/HEAD' && r !== REMOTE);
    const names = [...new Set(refs.map((r) => r.replace(new RegExp('^' + REMOTE + '/'), '')))];
    const usable = names.filter((n) => {
      const ref = refs.includes(n) ? n : REMOTE + '/' + n;
      return run(['grep', '-q', '-F', '/api/checkout', ref, '--', 'admin/public/common.js'], { allowFail: true }) !== null;
    });
    return { current, branches: usable.sort((a, b) => (a === BRANCH ? -1 : b === BRANCH ? 1 : a.localeCompare(b))) };
  }

  // Switches the working copy. Refuses with uncommitted files anywhere, so a
  // switch can never carry half-finished changes to another branch or lose
  // them. A local branch that is only behind GitHub is fast-forwarded.
  function checkout(name) {
    const { branches: allowed } = branches();
    if (!allowed.includes(name)) throw new GitError(`Unknown branch "${name}".`, 'branch');
    const dirty = run(['status', '--porcelain', '--untracked-files=all'], { raw: true }).split('\n').filter(Boolean).map((l) => l.slice(3));
    if (dirty.length) throw new GitError('Files here are not committed yet, so switching could lose them: ' + dirty.slice(0, 6).join(', ') + (dirty.length > 6 ? ' …' : '') + '. Publish them first.', 'dirty');
    const local = run(['rev-parse', '--verify', '--quiet', 'refs/heads/' + name], { allowFail: true });
    if (local) {
      run(['checkout', '--quiet', name]);
      run(['merge', '--ff-only', '--quiet', REMOTE + '/' + name], { allowFail: true });
    } else {
      run(['checkout', '--quiet', '-b', name, '--track', REMOTE + '/' + name]);
    }
    return state();
  }

  return { state, sync, publish, push, branches, checkout, GitError, BRANCH };
}

module.exports = { makeGit, GitError };
