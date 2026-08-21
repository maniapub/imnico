/* bench - a small editor for a folder on your own machine.
   No server, no upload: everything runs in the tab via the File System Access API. */

(function () {
'use strict';

var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
var $ = function (id) { return document.getElementById(id); };

/* ------------------------------------------------------------------ *
 * Custom In-Page Input Dialog
 * ------------------------------------------------------------------ */

function customPrompt(title, defaultValue) {
  return new Promise(function (resolve) {
    var wrap = $('promptWrap');
    var input = $('promptIn');
    var titleEl = $('promptTitle');
    var btnOk = $('btnPromptOk');
    var btnCancel = $('btnPromptCancel');

    titleEl.textContent = title;
    input.value = defaultValue || '';
    wrap.classList.remove('hidden');
    input.focus();
    input.select();

    function cleanup() {
      wrap.classList.add('hidden');
      btnOk.onclick = null;
      btnCancel.onclick = null;
      input.onkeydown = null;
    }

    btnOk.onclick = function () {
      var val = input.value.trim();
      cleanup();
      resolve(val || null);
    };

    btnCancel.onclick = function () {
      cleanup();
      resolve(null);
    };

    input.onkeydown = function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnOk.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        btnCancel.click();
      }
    };
  });
}

/* ------------------------------------------------------------------ *
 * Languages, keyed by extension
 * ------------------------------------------------------------------ */

var LANG = {};
function def(exts, o) { exts.split(' ').forEach(function (e) { LANG[e] = o; }); }

def('py pyw', { id: 'python', mode: 'text/x-python', files: ['python/python'], label: 'Python' });
def('js mjs cjs', { id: 'javascript', mode: 'text/javascript', files: ['javascript/javascript'], label: 'JavaScript' });
def('jsx', { id: 'javascript', mode: 'text/jsx', files: ['javascript/javascript', 'xml/xml', 'jsx/jsx'], label: 'JSX' });
def('ts', { id: 'typescript', mode: 'text/typescript', files: ['javascript/javascript'], label: 'TypeScript' });
def('tsx', { id: 'typescript', mode: 'text/typescript-jsx', files: ['javascript/javascript', 'xml/xml', 'jsx/jsx'], label: 'TSX' });
def('json jsonc', { id: 'json', mode: { name: 'javascript', json: true }, files: ['javascript/javascript'], label: 'JSON' });
def('html htm', { id: 'html', mode: 'text/html', files: ['xml/xml', 'javascript/javascript', 'css/css', 'htmlmixed/htmlmixed'], label: 'HTML' });
def('css', { id: 'css', mode: 'text/css', files: ['css/css'], label: 'CSS' });
def('scss sass less', { id: 'css', mode: 'text/x-scss', files: ['css/css'], label: 'SCSS' });
def('md markdown', { id: 'markdown', mode: 'text/markdown', files: ['xml/xml', 'markdown/markdown'], label: 'Markdown' });
def('yml yaml', { id: 'yaml', mode: 'text/x-yaml', files: ['yaml/yaml'], label: 'YAML' });
def('sh bash zsh command', { id: 'shell', mode: 'text/x-sh', files: ['shell/shell'], label: 'Shell' });
def('c h', { id: 'c', mode: 'text/x-csrc', files: ['clike/clike'], label: 'C' });
def('cpp cc cxx hpp hh', { id: 'c', mode: 'text/x-c++src', files: ['clike/clike'], label: 'C++' });
def('java', { id: 'java', mode: 'text/x-java', files: ['clike/clike'], label: 'Java' });
def('cs', { id: 'java', mode: 'text/x-csharp', files: ['clike/clike'], label: 'C#' });
def('go', { id: 'go', mode: 'text/x-go', files: ['go/go'], label: 'Go' });
def('rs', { id: 'rust', mode: 'text/x-rustsrc', files: ['rust/rust'], label: 'Rust' });
def('rb', { id: 'ruby', mode: 'text/x-ruby', files: ['ruby/ruby'], label: 'Ruby' });
def('php', { id: 'php', mode: 'application/x-httpd-php', files: ['xml/xml', 'javascript/javascript', 'css/css', 'htmlmixed/htmlmixed', 'clike/clike', 'php/php'], label: 'PHP' });
def('lua', { id: 'lua', mode: 'text/x-lua', files: ['lua/lua'], label: 'Lua' });
def('sql', { id: 'sql', mode: 'text/x-sql', files: ['sql/sql'], label: 'SQL' });
def('toml', { id: 'toml', mode: 'text/x-toml', files: ['toml/toml'], label: 'TOML' });
def('ini cfg conf env properties', { id: 'ini', mode: 'text/x-properties', files: ['properties/properties'], label: 'Config' });
def('xml svg xsl', { id: 'xml', mode: 'text/xml', files: ['xml/xml'], label: 'XML' });
def('dockerfile', { id: 'docker', mode: 'text/x-dockerfile', files: ['dockerfile/dockerfile'], label: 'Dockerfile' });
def('txt log text', { id: 'text', mode: null, files: [], label: 'Text' });

var PLAIN = { id: 'text', mode: null, files: [], label: 'Plain text' };
var IMAGE_EXT = 'png jpg jpeg gif webp ico bmp avif'.split(' ');

function extOf(name) {
  var b = name.split('/').pop().toLowerCase();
  var i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1) : '';
}
function langOf(path) {
  var b = path.split('/').pop().toLowerCase();
  if (b === 'dockerfile' || b.indexOf('dockerfile.') === 0) return LANG.dockerfile;
  if (b === 'makefile' || b === '.gitignore' || b === '.env' || b.indexOf('.env.') === 0) return LANG.ini || PLAIN;
  return LANG[extOf(b)] || PLAIN;
}
function isImage(path) { return IMAGE_EXT.indexOf(extOf(path)) >= 0; }

/* ------------------------------------------------------------------ *
 * Snippets and keywords
 * ------------------------------------------------------------------ */

var SNIP = {
  python: [
    ['def', 'def $0():\n    pass'],
    ['class', 'class $0:\n    def __init__(self):\n        pass'],
    ['if', 'if $0:\n    pass'],
    ['elif', 'elif $0:\n    pass'],
    ['else', 'else:\n    $0'],
    ['for', 'for item in $0:\n    pass'],
    ['while', 'while $0:\n    pass'],
    ['try', 'try:\n    $0\nexcept Exception as err:\n    print(err)'],
    ['with', 'with open($0) as f:\n    pass'],
    ['main', "if __name__ == '__main__':\n    $0"],
    ['print', 'print($0)'],
    ['import', 'import $0'],
    ['from', 'from $0 import '],
    ['lambda', 'lambda $0: '],
    ['async', 'async def $0():\n    pass'],
    ['await', 'await $0']
  ],
  javascript: [
    ['function', 'function $0() {\n    \n}'],
    ['arrow', 'const $0 = () => {\n    \n};'],
    ['async', 'async function $0() {\n    \n}'],
    ['if', 'if ($0) {\n    \n}'],
    ['else', 'else {\n    $0\n}'],
    ['for', 'for (let i = 0; i < $0; i++) {\n    \n}'],
    ['forof', 'for (const item of $0) {\n    \n}'],
    ['while', 'while ($0) {\n    \n}'],
    ['switch', 'switch ($0) {\n    case 1:\n        break;\n    default:\n        break;\n}'],
    ['try', 'try {\n    $0\n} catch (err) {\n    console.error(err);\n}'],
    ['class', 'class $0 {\n    constructor() {\n        \n    }\n}'],
    ['log', 'console.log($0);'],
    ['fetch', 'const res = await fetch($0);\nconst data = await res.json();'],
    ['listen', "addEventListener('$0', function (e) {\n    \n});"],
    ['timeout', 'setTimeout(function () {\n    $0\n}, 1000);']
  ],
  html: [
    ['html5', '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>$0</title>\n</head>\n<body>\n\n</body>\n</html>'],
    ['div', '<div class="$0"></div>'],
    ['span', '<span>$0</span>'],
    ['a', '<a href="$0"></a>'],
    ['img', '<img src="$0" alt="">'],
    ['ul', '<ul>\n    <li>$0</li>\n</ul>'],
    ['button', '<button>$0</button>'],
    ['input', '<input type="text" name="$0">'],
    ['form', '<form>\n    $0\n</form>'],
    ['script', '<script src="$0"></script>'],
    ['style', '<link rel="stylesheet" href="$0">'],
    ['table', '<table>\n    <tr>\n        <th>$0</th>\n    </tr>\n</table>']
  ],
  css: [
    ['flex', 'display: flex;\nalign-items: center;\ngap: $0;'],
    ['grid', 'display: grid;\ngrid-template-columns: $0;\ngap: 1rem;'],
    ['media', '@media (max-width: $0px) {\n    \n}'],
    ['absolute', 'position: absolute;\ninset: $0;'],
    ['transition', 'transition: $0 .2s ease;'],
    ['font', 'font-family: $0;'],
    ['var', 'var(--$0)'],
    ['keyframes', '@keyframes $0 {\n    from { }\n    to { }\n}'],
    ['shadow', 'box-shadow: 0 2px 8px rgba(0, 0, 0, .2);$0']
  ],
  shell: [
    ['shebang', '#!/usr/bin/env bash\nset -euo pipefail\n$0'],
    ['for', 'for f in $0; do\n    \ndone'],
    ['if', 'if [ $0 ]; then\n    \nfi'],
    ['while', 'while read -r line; do\n    $0\ndone'],
    ['case', 'case "$0" in\n    a) ;;\n    *) ;;\nesac'],
    ['func', '$0() {\n    \n}']
  ],
  markdown: [
    ['link', '[$0]()'],
    ['img', '![$0]()'],
    ['code', '```\n$0\n```'],
    ['table', '| $0 |  |\n| --- | --- |\n|  |  |'],
    ['todo', '- [ ] $0']
  ],
  go: [
    ['func', 'func $0() {\n    \n}'],
    ['main', 'func main() {\n    $0\n}'],
    ['if', 'if $0 {\n    \n}'],
    ['for', 'for i := 0; i < $0; i++ {\n    \n}'],
    ['range', 'for i, v := range $0 {\n    \n}'],
    ['err', 'if err != nil {\n    return err\n}$0'],
    ['struct', 'type $0 struct {\n    \n}']
  ],
  rust: [
    ['fn', 'fn $0() {\n    \n}'],
    ['main', 'fn main() {\n    $0\n}'],
    ['if', 'if $0 {\n    \n}'],
    ['for', 'for item in $0 {\n    \n}'],
    ['match', 'match $0 {\n    _ => {}\n}'],
    ['struct', 'struct $0 {\n    \n}'],
    ['impl', 'impl $0 {\n    \n}'],
    ['print', 'println!("{}", $0);']
  ],
  c: [
    ['main', 'int main(int argc, char **argv) {\n    $0\n    return 0;\n}'],
    ['if', 'if ($0) {\n    \n}'],
    ['for', 'for (int i = 0; i < $0; i++) {\n    \n}'],
    ['while', 'while ($0) {\n    \n}'],
    ['struct', 'struct $0 {\n    \n};'],
    ['include', '#include <$0>'],
    ['printf', 'printf("$0\\n");']
  ],
  java: [
    ['main', 'public static void main(String[] args) {\n    $0\n}'],
    ['class', 'public class $0 {\n    \n}'],
    ['if', 'if ($0) {\n    \n}'],
    ['for', 'for (int i = 0; i < $0; i++) {\n    \n}'],
    ['try', 'try {\n    $0\n} catch (Exception e) {\n    e.printStackTrace();\n}'],
    ['print', 'System.out.println($0);']
  ],
  lua: [
    ['function', 'function $0()\n    \nend'],
    ['if', 'if $0 then\n    \nend'],
    ['for', 'for i = 1, $0 do\n    \nend'],
    ['pairs', 'for k, v in pairs($0) do\n    \nend'],
    ['while', 'while $0 do\n    \nend']
  ],
  ruby: [
    ['def', 'def $0\n    \nend'],
    ['class', 'class $0\n    \nend'],
    ['if', 'if $0\n    \nend'],
    ['each', '$0.each do |item|\n    \nend']
  ],
  php: [
    ['php', '<?php\n$0'],
    ['function', 'function $0() {\n    \n}'],
    ['if', 'if ($0) {\n    \n}'],
    ['foreach', 'foreach ($0 as $item) {\n    \n}'],
    ['echo', 'echo $0;']
  ],
  sql: [
    ['select', 'SELECT $0\nFROM \nWHERE ;'],
    ['insert', 'INSERT INTO $0 ()\nVALUES ();'],
    ['update', 'UPDATE $0\nSET \nWHERE ;'],
    ['create', 'CREATE TABLE $0 (\n    id INTEGER PRIMARY KEY\n);']
  ],
  yaml: [
    ['compose', "services:\n  $0:\n    image: \n    restart: unless-stopped\n    ports:\n      - '8080:8080'"],
    ['job', 'name: $0\non:\n  push:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4']
  ],
  docker: [
    ['from', 'FROM $0'],
    ['run', 'RUN $0'],
    ['copy', 'COPY $0 .'],
    ['workdir', 'WORKDIR /$0'],
    ['cmd', 'CMD ["$0"]'],
    ['expose', 'EXPOSE $0']
  ]
};

var KW = {
  python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self print len range str int float bool list dict set tuple open enumerate zip sorted sum min max abs round input isinstance type super format join split strip append extend items keys values get pop replace startswith endswith',
  javascript: 'async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield console document window length push pop map filter reduce forEach includes indexOf slice splice split join replace JSON parse stringify Promise resolve reject then catch querySelector querySelectorAll addEventListener createElement appendChild classList setAttribute textContent innerHTML',
  typescript: 'abstract any as async await boolean break case catch class const constructor continue declare default enum export extends false finally for from function if implements import in interface keyof let namespace never new null number of private protected public readonly return static string super switch this throw true try type typeof undefined unknown var void while yield',
  html: 'div span a img ul ol li p h1 h2 h3 h4 section header footer main nav article aside form input button label select option textarea table thead tbody tr td th script link meta title style class id href src alt type name value placeholder rel width height target data- aria-',
  css: 'align-items background background-color border border-radius bottom box-shadow color cursor display flex flex-direction font-family font-size font-weight gap grid grid-template-columns height inset justify-content left letter-spacing line-height margin max-width min-height opacity overflow padding position right text-align text-transform top transform transition width z-index absolute relative fixed sticky none block inline-block pointer hidden auto',
  shell: 'if then else elif fi for while do done case esac function return local export source echo read cd ls mkdir rm cp mv cat grep sed awk find chmod chown curl wget tar sudo apt docker git python3 pip systemctl',
  c: 'auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while include define printf scanf malloc free NULL',
  java: 'abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch this throw throws try void while String System',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false error string int int64 float64 bool make new len cap append copy delete panic recover fmt Println Printf Errorf',
  rust: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while String Vec Option Some None Result Ok Err println format clone unwrap expect',
  ruby: 'def end class module if elsif else unless while until for do begin rescue ensure return yield self nil true false require attr_accessor puts each map select',
  php: 'abstract and array as break case catch class const continue declare default do echo else elseif empty endif extends final finally for foreach function global if implements include instanceof interface isset namespace new or print private protected public require return static switch throw trait try unset use var while',
  lua: 'and break do else elseif end false for function goto if in local nil not or repeat return then true until while print pairs ipairs require table string math os io',
  sql: 'SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT OFFSET DISTINCT COUNT SUM AVG MIN MAX AS AND OR NOT NULL PRIMARY KEY FOREIGN REFERENCES DEFAULT UNIQUE',
  yaml: 'name on jobs steps runs-on uses with env services image ports volumes restart depends_on build container_name networks command environment',
  json: 'true false null',
  docker: 'FROM RUN CMD LABEL EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD HEALTHCHECK',
  markdown: '',
  ini: '',
  xml: '',
  text: ''
};

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

var DEFAULTS = {
  theme: 'graphite', cmTheme: 'bench',
  uiSize: 13, edSize: 14, conSize: 13, density: 24,
  sideW: 260, conH: 220,
  tabSize: 4, insertSpaces: true, tabComplete: true,
  wrap: false, lineNumbers: true, activeLine: true, brackets: true,
  autoSave: false, showHidden: false, ignoreJunk: true,
  sideOpen: true, conOpen: true
};
var S = Object.assign({}, DEFAULTS);

function loadSettings() {
  try {
    var raw = localStorage.getItem('bench.settings');
    if (raw) S = Object.assign({}, DEFAULTS, JSON.parse(raw));
  } catch (e) { /* first run, or storage blocked */ }
}
var saveTimer = null;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem('bench.settings', JSON.stringify(S)); } catch (e) {}
  }, 150);
}

var IGNORED = ['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build',
  '.next', '.cache', '.mypy_cache', '.pytest_cache', 'target', '.idea', '.DS_Store'];

function applySettings() {
  var r = document.documentElement;
  r.setAttribute('data-theme', S.theme);
  r.style.setProperty('--ui-size', S.uiSize + 'px');
  r.style.setProperty('--ed-size', S.edSize + 'px');
  r.style.setProperty('--con-size', S.conSize + 'px');
  r.style.setProperty('--row-h', S.density + 'px');
  r.style.setProperty('--side-w', S.sideW + 'px');
  r.style.setProperty('--con-h', S.conH + 'px');
  $('side').classList.toggle('hidden', !S.sideOpen);
  $('gripV').classList.toggle('hidden', !S.sideOpen);
  $('console').classList.toggle('collapsed', !S.conOpen);
  $('gripH').classList.toggle('hidden', !S.conOpen);
  $('stIndent').textContent = (S.insertSpaces ? 'Spaces: ' : 'Tab width: ') + S.tabSize;
  if (cm) {
    cm.setOption('theme', S.cmTheme);
    cm.setOption('lineNumbers', S.lineNumbers);
    cm.setOption('lineWrapping', S.wrap);
    cm.setOption('styleActiveLine', S.activeLine);
    cm.setOption('autoCloseBrackets', S.brackets);
    cm.setOption('tabSize', S.tabSize);
    cm.setOption('indentUnit', S.tabSize);
    cm.setOption('indentWithTabs', !S.insertSpaces);
    if (S.cmTheme !== 'bench') loadCss(CDN + 'theme/' + S.cmTheme + '.min.css');
    setTimeout(function () { cm.refresh(); }, 0);
  }
  saveSettings();
}

/* ------------------------------------------------------------------ *
 * Asset loading (CodeMirror)
 * ------------------------------------------------------------------ */

var anchor = document.querySelector('link[href="./styles.css"]');
var loaded = {};

function loadCss(href, first) {
  if (loaded['c:' + href]) return;
  loaded['c:' + href] = true;
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  if (first && anchor) document.head.insertBefore(l, anchor);
  else document.head.appendChild(l);
}
function loadJs(src) {
  if (loaded['j:' + src]) return loaded['j:' + src];
  loaded['j:' + src] = new Promise(function (res) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () { res(true); };
    s.onerror = function () { res(false); };
    document.head.appendChild(s);
  });
  return loaded['j:' + src];
}
async function loadSeq(list) {
  for (var i = 0; i < list.length; i++) await loadJs(list[i]);
}
async function ensureMode(lang) {
  if (!lang.files.length) return;
  await loadSeq(lang.files.map(function (f) { return CDN + 'mode/' + f + '.min.js'; }));
}

var NOCM = false;
var cm = null;

async function bootEditor() {
  loadCss(CDN + 'codemirror.min.css', true);
  loadCss(CDN + 'addon/hint/show-hint.min.css', true);
  loadCss(CDN + 'addon/dialog/dialog.min.css', true);
  var ok = await loadJs(CDN + 'codemirror.min.js');
  if (!ok || !window.CodeMirror) { NOCM = true; return; }
  await loadSeq([
    CDN + 'addon/hint/show-hint.min.js',
    CDN + 'addon/edit/closebrackets.min.js',
    CDN + 'addon/edit/matchbrackets.min.js',
    CDN + 'addon/comment/comment.min.js',
    CDN + 'addon/selection/active-line.min.js',
    CDN + 'addon/dialog/dialog.min.js',
    CDN + 'addon/search/searchcursor.min.js',
    CDN + 'addon/search/search.min.js',
    CDN + 'addon/search/jump-to-line.min.js'
  ]);

  cm = CodeMirror($('cmHost'), {
    value: '',
    theme: S.cmTheme,
    lineNumbers: S.lineNumbers,
    lineWrapping: S.wrap,
    styleActiveLine: S.activeLine,
    autoCloseBrackets: S.brackets,
    matchBrackets: true,
    tabSize: S.tabSize,
    indentUnit: S.tabSize,
    indentWithTabs: !S.insertSpaces,
    extraKeys: {
      Tab: onTab,
      'Shift-Tab': function (c) { c.indentSelection('subtract'); },
      'Ctrl-Space': function (c) { showHints(c); },
      'Ctrl-/': function (c) { c.toggleComment(); },
      'Cmd-/': function (c) { c.toggleComment(); },
      'Ctrl-S': function () { saveActive(); },
      'Cmd-S': function () { saveActive(); }
    }
  });

  cm.on('change', function () {
    var e = openTabs.get(active);
    if (!e) return;
    var d = !e.doc.isClean(e.gen);
    if (d !== e.dirty) { e.dirty = d; renderTabs(); markTreeDirty(); }
    if (S.autoSave && d) scheduleAutoSave();
  });
  cm.on('cursorActivity', function () {
    var c = cm.getCursor();
    $('stPos').textContent = 'Ln ' + (c.line + 1) + ', Col ' + (c.ch + 1);
  });
}

/* ------------------------------------------------------------------ *
 * Tab completion
 * ------------------------------------------------------------------ */

var WORD = /[A-Za-z0-9_$-]/;

function onTab(c) {
  if (c.somethingSelected()) return c.indentSelection('add');
  var cur = c.getCursor();
  var before = c.getLine(cur.line).slice(0, cur.ch);
  if (S.tabComplete && WORD.test(before.slice(-1) || '')) return showHints(c);
  if (S.insertSpaces) {
    var n = S.tabSize - (cur.ch % S.tabSize);
    c.replaceSelection(new Array(n + 1).join(' '));
  } else {
    c.replaceSelection('\t');
  }
}

function showHints(c) {
  if (!CodeMirror.showHint) return;
  CodeMirror.showHint(c, hintSource, { completeSingle: false, closeOnUnfocus: true });
}

function docWords(c) {
  var text = c.getValue();
  if (text.length > 400000) text = text.slice(0, 400000);
  var re = /[A-Za-z_$][A-Za-z0-9_$]{2,}/g, seen = {}, out = [], m, n = 0;
  while ((m = re.exec(text)) && n < 4000) {
    if (!seen[m[0]]) { seen[m[0]] = 1; out.push(m[0]); n++; }
  }
  return out;
}

function indentUnit() { return S.insertSpaces ? new Array(S.tabSize + 1).join(' ') : '\t'; }

function hintSource(c) {
  var cur = c.getCursor(), line = c.getLine(cur.line);
  var start = cur.ch;
  while (start > 0 && WORD.test(line.charAt(start - 1))) start--;
  var word = line.slice(start, cur.ch);
  var lw = word.toLowerCase();
  var e = openTabs.get(active);
  var langId = e ? e.lang.id : 'text';

  var seen = {}, snips = [], keys = [], words = [];
  function add(bucket, t, kind, tpl) {
    if (!t || seen[kind + t]) return;
    if (lw && t.toLowerCase().indexOf(lw) !== 0) return;
    if (t === word && !tpl) return;
    seen[kind + t] = 1;
    bucket.push({ t: t, kind: kind, tpl: tpl });
  }
  (SNIP[langId] || []).forEach(function (s) { add(snips, s[0], 'snippet', s[1]); });
  (KW[langId] || '').split(' ').forEach(function (k) { add(keys, k, 'keyword'); });
  docWords(c).forEach(function (w) { add(words, w, 'in file'); });

  var all = snips.concat(keys, words).slice(0, 200);
  var list = all.map(function (it) {
    return {
      text: it.t,
      displayText: it.t,
      className: 'hint-' + it.kind,
      render: function (el) {
        var a = document.createElement('span');
        a.textContent = it.t;
        var b = document.createElement('span');
        b.className = 'hint-kind';
        b.textContent = it.kind;
        el.appendChild(a);
        el.appendChild(b);
      },
      hint: function (editor, data, item) {
        if (!it.tpl) { editor.replaceRange(it.t, data.from, data.to); return; }
        insertSnippet(editor, data.from, data.to, it.tpl);
      }
    };
  });
  return { list: list, from: CodeMirror.Pos(cur.line, start), to: cur };
}

function insertSnippet(editor, from, to, tpl) {
  var pad = /^[ \t]*/.exec(editor.getLine(from.line))[0];
  var unit = indentUnit();
  var body = tpl.split('\n').map(function (ln, i) {
    ln = ln.replace(/^( +)/, function (m) { return new Array(Math.floor(m.length / 4) + 1).join(unit); });
    return i === 0 ? ln : pad + ln;
  }).join('\n');

  var idx = body.indexOf('$0');
  if (idx >= 0) body = body.slice(0, idx) + body.slice(idx + 2);
  editor.replaceRange(body, from, to);

  if (idx >= 0) {
    var pre = body.slice(0, idx).split('\n');
    var ln = from.line + pre.length - 1;
    var ch = pre.length > 1 ? pre[pre.length - 1].length : from.ch + pre[0].length;
    editor.setCursor({ line: ln, ch: ch });
  }
}

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

function norm(p) {
  var out = [];
  String(p || '').split('/').forEach(function (part) {
    if (!part || part === '.') return;
    if (part === '..') { out.pop(); return; }
    out.push(part);
  });
  return out.join('/');
}
function dirname(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
function basename(p) { return p.split('/').pop(); }
function resolve(cwd, p) {
  p = String(p || '');
  if (p.charAt(0) === '/' || p === '~') return norm(p === '~' ? '' : p);
  if (p.indexOf('~/') === 0) return norm(p.slice(2));
  return norm(cwd + '/' + p);
}

/* ------------------------------------------------------------------ *
 * File system
 * ------------------------------------------------------------------ */

var root = null;
var dirCache = new Map();
var kidCache = new Map();

function clearCaches() { dirCache.clear(); kidCache.clear(); emptyCache.clear(); fileIndex = null; }

async function getDir(rel, create) {
  rel = norm(rel);
  if (rel === '') return root;
  var hit = dirCache.get(rel);
  if (hit && !create) return hit;
  var h = root, parts = rel.split('/');
  for (var i = 0; i < parts.length; i++) h = await h.getDirectoryHandle(parts[i], { create: !!create });
  dirCache.set(rel, h);
  return h;
}
async function getFileHandle(rel, create) {
  var d = await getDir(dirname(rel), create);
  return d.getFileHandle(basename(rel), { create: !!create });
}
async function exists(rel) {
  if (!rel) return 'directory';
  try { await getFileHandle(rel); return 'file'; } catch (e) {}
  try { await getDir(rel); return 'directory'; } catch (e) {}
  return null;
}
async function listDir(rel, raw) {
  rel = norm(rel);
  var key = rel + (raw ? '|raw' : '');
  if (kidCache.has(key)) return kidCache.get(key);
  var d = await getDir(rel), out = [];
  for await (var ent of d.entries()) {
    var name = ent[0], h = ent[1];
    if (!raw) {
      if (!S.showHidden && name.charAt(0) === '.') continue;
      if (S.ignoreJunk && IGNORED.indexOf(name) >= 0) continue;
    }
    out.push({ name: name, kind: h.kind, path: rel ? rel + '/' + name : name });
  }
  out.sort(function (a, b) {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
  });
  kidCache.set(key, out);
  return out;
}
async function readText(rel) {
  var fh = await getFileHandle(rel);
  var f = await fh.getFile();
  var buf = await f.arrayBuffer();
  var probe = new Uint8Array(buf.slice(0, 4096));
  for (var i = 0; i < probe.length; i++) if (probe[i] === 0) return { binary: true, size: f.size };
  return { text: new TextDecoder().decode(buf), size: f.size };
}
async function writeText(rel, text) {
  var fh = await getFileHandle(rel, true);
  var w = await fh.createWritable();
  await w.write(text);
  await w.close();
}
async function removePath(rel) {
  var d = await getDir(dirname(rel));
  await d.removeEntry(basename(rel), { recursive: true });
  clearCaches();
}
async function copyFile(src, dst) {
  var fh = await getFileHandle(src);
  var f = await fh.getFile();
  var buf = await f.arrayBuffer();
  var out = await getFileHandle(dst, true);
  var w = await out.createWritable();
  await w.write(buf);
  await w.close();
}
async function copyTree(src, dst) {
  var kind = await exists(src);
  if (kind === 'file') return copyFile(src, dst);
  await getDir(dst, true);
  var kids = await listDir(src, true);
  for (var i = 0; i < kids.length; i++) {
    await copyTree(kids[i].path, dst + '/' + kids[i].name);
  }
}
async function movePath(src, dst) {
  await copyTree(src, dst);
  await removePath(src);
  clearCaches();
}

/* remembering the folder between visits */
function idb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('bench', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}
async function idbSet(k, v) {
  var db = await idb();
  return new Promise(function (res, rej) {
    var t = db.transaction('kv', 'readwrite');
    t.objectStore('kv').put(v, k);
    t.oncomplete = function () { res(); };
    t.onerror = function () { rej(t.error); };
  });
}
async function idbGet(k) {
  var db = await idb();
  return new Promise(function (res, rej) {
    var t = db.transaction('kv', 'readonly');
    var q = t.objectStore('kv').get(k);
    q.onsuccess = function () { res(q.result); };
    q.onerror = function () { rej(q.error); };
  });
}

/* ------------------------------------------------------------------ *
 * Opening a folder
 * ------------------------------------------------------------------ */

async function pickFolder() {
  if (!window.showDirectoryPicker) return fallbackOpen();
  try {
    var h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'bench-root' });
    await useFolder(h);
    try { await idbSet('root', h); } catch (e) {}
  } catch (e) {
    if (e && e.name !== 'AbortError') status('Could not open that folder: ' + e.message);
  }
}
async function useFolder(h) {
  var perm = await h.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    perm = await h.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { status('Write access denied'); return; }
  }
  root = h;
  expanded.clear();
  clearCaches();
  cwd = '';
  $('crumb').innerHTML = '';
  var b = document.createElement('b');
  b.textContent = h.name;
  $('crumb').appendChild(b);
  document.title = h.name + ' - bench';
  await renderTree();
  conPrompt();
  conOut('Opened ' + h.name, 'ok');
  status('Opened ' + h.name);
}
async function offerLastFolder() {
  if (!window.showDirectoryPicker) return;
  try {
    var h = await idbGet('root');
    if (!h) return;
    var el = $('lastFolder');
    el.classList.remove('hidden');
    var btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Reopen ' + h.name;
    btn.onclick = function () { useFolder(h); };
    el.appendChild(btn);
  } catch (e) {}
}

/* read-only fallback for browsers without the File System Access API */
function fallbackOpen() {
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.multiple = true;
  inp.onchange = async function () {
    for (var i = 0; i < inp.files.length; i++) {
      var f = inp.files[i];
      var text = await f.text();
      openLoose(f.name, text);
    }
  };
  inp.click();
}
function openLoose(name, text) {
  var lang = langOf(name);
  var e = { path: name, lang: lang, dirty: false, loose: true, text: text };
  ensureMode(lang).then(function () {
    if (!NOCM) {
      e.doc = CodeMirror.Doc(text, lang.mode || null);
      e.gen = e.doc.changeGeneration(true);
    }
    openTabs.set(name, e);
    activate(name);
  });
}

/* ------------------------------------------------------------------ *
 * Tree
 * ------------------------------------------------------------------ */

var expanded = new Set();
var treeEl = null;
var emptyCache = new Map();
var forceShow = new Set();

/* a folder counts as empty if it has no files anywhere below it, once the
   current hidden/junk filters are applied - a folder of only empty folders
   is still empty */
async function isEmptyDir(path) {
  if (emptyCache.has(path)) return emptyCache.get(path);
  var kids = await listDir(path);
  var empty = true;
  for (var i = 0; i < kids.length; i++) {
    if (kids[i].kind === 'file') { empty = false; break; }
    if (!(await isEmptyDir(kids[i].path))) { empty = false; break; }
  }
  emptyCache.set(path, empty);
  return empty;
}

async function renderTree() {
  treeEl = $('tree');
  if (!root) return;
  treeEl.innerHTML = '';
  try {
    await renderInto(treeEl, '', 0);
    if (!treeEl.children.length) {
      var d = document.createElement('div');
      d.className = 'tree-empty';
      d.textContent = 'This folder is empty.';
      treeEl.appendChild(d);
    }
  } catch (e) {
    status('Could not read folder: ' + e.message);
  }
}
async function renderInto(box, rel, depth) {
  var kids = await listDir(rel);
  for (var i = 0; i < kids.length; i++) {
    var k = kids[i];
    if (k.kind === 'directory' && !forceShow.has(k.path) && await isEmptyDir(k.path)) continue;
    box.appendChild(nodeRow(k, depth));
    if (k.kind === 'directory' && expanded.has(k.path)) {
      var sub = document.createElement('div');
      box.appendChild(sub);
      await renderInto(sub, k.path, depth + 1);
    }
  }
}
function nodeRow(k, depth) {
  var isDir = k.kind === 'directory';
  var el = document.createElement('div');
  el.className = 'node ' + (isDir ? 'dir' : 'file');
  el.style.setProperty('--indent', (0.6 + depth * 1.1) + 'em');
  el.dataset.path = k.path;
  el.dataset.kind = k.kind;

  var tw = document.createElement('span');
  tw.className = 'twist';
  tw.textContent = isDir ? (expanded.has(k.path) ? '\u25BE' : '\u25B8') : '';
  el.appendChild(tw);

  var nm = document.createElement('span');
  nm.className = 'name';
  nm.textContent = k.name;
  el.appendChild(nm);

  if (!isDir) {
    var lang = isImage(k.name) ? { id: 'image' } : langOf(k.name);
    el.dataset.lang = lang.id;
    var chip = document.createElement('span');
    chip.className = 'chip';
    var ex = extOf(k.name);
    chip.textContent = ex ? ex.slice(0, 4) : '\u00B7';
    el.appendChild(chip);
    var t = openTabs.get(k.path);
    if (t && t.dirty) el.classList.add('dirty');
    if (k.path === active) el.classList.add('active');
  }

  el.onclick = function () {
    if (isDir) {
      if (expanded.has(k.path)) expanded.delete(k.path); else expanded.add(k.path);
      renderTree();
    } else {
      openFile(k.path);
    }
  };
  el.oncontextmenu = function (ev) { ev.preventDefault(); contextMenu(ev, k); };

  if (!isDir) {
    el.draggable = true;
    el.addEventListener('dragstart', function (ev) {
      dragSrcPath = k.path;
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', k.path); } catch (e) {}
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', function () {
      el.classList.remove('dragging');
      dragSrcPath = null;
      clearDropHighlight();
    });
  } else {
    el.addEventListener('dragover', function (ev) {
      if (!dragSrcPath || dirname(dragSrcPath) === k.path) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = 'move';
      if (dropHighlightEl !== el) { clearDropHighlight(); el.classList.add('drop-target'); dropHighlightEl = el; }
    });
    el.addEventListener('dragleave', function () {
      if (dropHighlightEl === el) clearDropHighlight();
    });
    el.addEventListener('drop', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var src = dragSrcPath;
      clearDropHighlight();
      if (src) moveIntoFolder(src, k.path);
    });
  }

  return el;
}

/* dropping a file onto a folder row, or onto the empty tree background
   to send it back to the top level */
async function moveIntoFolder(srcPath, destDir) {
  if (dirname(srcPath) === destDir) return;
  var dst = norm((destDir ? destDir + '/' : '') + basename(srcPath));
  if (await exists(dst)) { status(basename(srcPath) + ' already exists there'); return; }
  try {
    await movePath(srcPath, dst);
    if (openTabs.has(srcPath)) {
      var e = openTabs.get(srcPath);
      openTabs.delete(srcPath);
      e.path = dst;
      e.lang = langOf(dst);
      openTabs.set(dst, e);
      if (active === srcPath) active = dst;
    }
    if (destDir) expanded.add(destDir);
    await renderTree();
    renderTabs();
    status('Moved to ' + (destDir || '~'));
  } catch (err) {
    status('Move failed: ' + err.message);
  }
}
var dragSrcPath = null;
var dropHighlightEl = null;
function clearDropHighlight() {
  if (dropHighlightEl) { dropHighlightEl.classList.remove('drop-target'); dropHighlightEl.classList.remove('drop-target-root'); dropHighlightEl = null; }
}

function markTreeDirty() {
  if (!treeEl) return;
  Array.prototype.forEach.call(treeEl.querySelectorAll('.node.file'), function (el) {
    var t = openTabs.get(el.dataset.path);
    el.classList.toggle('dirty', !!(t && t.dirty));
    el.classList.toggle('active', el.dataset.path === active);
  });
}

/* ------------------------------------------------------------------ *
 * Context menu
 * ------------------------------------------------------------------ */

function contextMenu(ev, k) {
  var m = $('ctx');
  m.innerHTML = '';
  var dirFor = k.kind === 'directory' ? k.path : dirname(k.path);
  function item(label, fn) {
    var d = document.createElement('div');
    d.textContent = label;
    d.onclick = function () { hideCtx(); fn(); };
    m.appendChild(d);
  }
  item('New file', function () { newEntry(dirFor, 'file'); });
  item('New folder', function () { newEntry(dirFor, 'dir'); });
  m.appendChild(document.createElement('hr'));
  item('Rename', function () { renameEntry(k); });
  item('Delete', function () { deleteEntry(k); });
  m.appendChild(document.createElement('hr'));
  item('Copy path', function () {
    navigator.clipboard && navigator.clipboard.writeText(k.path);
    status('Path copied');
  });
  m.classList.remove('hidden');
  m.style.left = Math.min(ev.clientX, innerWidth - 170) + 'px';
  m.style.top = Math.min(ev.clientY, innerHeight - m.offsetHeight - 10) + 'px';
}
function hideCtx() { $('ctx').classList.add('hidden'); }
document.addEventListener('click', hideCtx);
document.addEventListener('scroll', hideCtx, true);

async function newEntry(dir, kind) {
  if (!root) return status('Open a folder first');
  var title = kind === 'dir' ? 'New Folder Name' : 'New File Name';
  var defaultVal = kind === 'dir' ? '' : 'untitled.txt';
  var name = await customPrompt(title, defaultVal);
  if (!name) return;
  var path = norm((dir ? dir + '/' : '') + name);
  try {
    if (kind === 'dir') { await getDir(path, true); forceShow.add(path); }
    else await writeText(path, '');
    clearCaches();
    if (dir) expanded.add(dir);
    await renderTree();
    if (kind === 'file') openFile(path);
    status('Created ' + name);
  } catch (e) { status('Could not create: ' + e.message); }
}
async function renameEntry(k) {
  var name = await customPrompt('Rename To', k.name);
  if (!name || name === k.name) return;
  var dst = norm(dirname(k.path) + '/' + name);
  try {
    await movePath(k.path, dst);
    if (openTabs.has(k.path)) {
      var e = openTabs.get(k.path);
      openTabs.delete(k.path);
      e.path = dst;
      e.lang = langOf(dst);
      openTabs.set(dst, e);
      if (active === k.path) active = dst;
    }
    await renderTree();
    renderTabs();
    status('Renamed to ' + name);
  } catch (e) { status('Rename failed: ' + e.message); }
}
async function deleteEntry(k) {
  if (!confirm('Delete ' + k.name + '?' + (k.kind === 'directory' ? '\n\nEverything inside goes too.' : ''))) return;
  try {
    await removePath(k.path);
    closeTab(k.path, true);
    await renderTree();
    status('Deleted ' + k.name);
  } catch (e) { status('Delete failed: ' + e.message); }
}

/* ------------------------------------------------------------------ *
 * Tabs and editing
 * ------------------------------------------------------------------ */

var openTabs = new Map();
var active = null;
var fallbackTa = null;

async function openFile(path) {
  if (openTabs.has(path)) return activate(path);
  if (isImage(path)) return showImage(path);
  try {
    var r = await readText(path);
    if (r.binary) { showBinary(path, r.size); return; }
    var lang = langOf(path);
    await ensureMode(lang);
    var e = { path: path, lang: lang, dirty: false, text: r.text };
    if (!NOCM) {
      e.doc = CodeMirror.Doc(r.text, lang.mode || null);
      e.gen = e.doc.changeGeneration(true);
    }
    openTabs.set(path, e);
    activate(path);
  } catch (err) {
    status('Could not open ' + basename(path) + ': ' + err.message);
  }
}

function activate(path) {
  active = path;
  var e = openTabs.get(path);
  $('welcome').classList.add('hidden');
  $('viewHost').classList.add('hidden');
  $('cmHost').classList.remove('hidden');
  if (!e) return;
  if (NOCM) {
    if (!fallbackTa) {
      fallbackTa = document.createElement('textarea');
      fallbackTa.className = 'fallback-editor';
      fallbackTa.spellcheck = false;
      fallbackTa.addEventListener('input', function () {
        var cur = openTabs.get(active);
        if (!cur) return;
        cur.text = fallbackTa.value;
        cur.dirty = true;
        renderTabs();
      });
      $('cmHost').appendChild(fallbackTa);
    }
    fallbackTa.value = e.text;
    fallbackTa.focus();
  } else {
    cm.swapDoc(e.doc);
    cm.setOption('mode', e.lang.mode || null);
    cm.focus();
    setTimeout(function () { cm.refresh(); }, 0);
  }
  $('stLang').textContent = e.lang.label;
  renderTabs();
  markTreeDirty();
}

function renderTabs() {
  var box = $('tabs');
  box.innerHTML = '';
  openTabs.forEach(function (e, path) {
    var t = document.createElement('div');
    t.className = 'tab' + (path === active ? ' active' : '') + (e.dirty ? ' dirty' : '');
    var n = document.createElement('span');
    n.textContent = basename(path);
    t.appendChild(n);
    var x = document.createElement('span');
    x.className = 'x';
    x.textContent = '\u2715';
    x.onclick = function (ev) { ev.stopPropagation(); closeTab(path); };
    t.appendChild(x);
    t.onclick = function () { activate(path); };
    t.title = path;
    box.appendChild(t);
  });
  markTreeDirty();
}

function closeTab(path, force) {
  var e = openTabs.get(path);
  if (!e) return;
  if (e.dirty && !force && !confirm(basename(path) + ' has unsaved changes. Close anyway?')) return;
  openTabs.delete(path);
  if (active === path) {
    active = null;
    var next = openTabs.keys().next();
    if (!next.done) activate(next.value);
    else {
      $('welcome').classList.remove('hidden');
      $('stLang').textContent = '-';
      if (NOCM && fallbackTa) fallbackTa.value = '';
      else if (cm) cm.swapDoc(CodeMirror.Doc(''));
    }
  }
  renderTabs();
}

function currentText(e) { return NOCM ? e.text : e.doc.getValue(); }

async function saveActive() {
  var e = openTabs.get(active);
  if (!e) return;
  var text = currentText(e);
  if (e.loose) {
    var blob = new Blob([text], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = basename(e.path);
    a.click();
    status('Downloaded ' + basename(e.path));
    return;
  }
  try {
    await writeText(e.path, text);
    e.dirty = false;
    if (!NOCM) e.gen = e.doc.changeGeneration(true);
    e.text = text;
    renderTabs();
    status('Saved ' + basename(e.path));
  } catch (err) {
    status('Save failed: ' + err.message);
  }
}
var autoTimer = null;
function scheduleAutoSave() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(saveActive, 2000);
}

async function showImage(path) {
  try {
    var fh = await getFileHandle(path);
    var f = await fh.getFile();
    var host = $('viewHost');
    host.innerHTML = '';
    var img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    img.alt = basename(path);
    host.appendChild(img);
    var cap = document.createElement('div');
    cap.textContent = basename(path) + ' - ' + fmtSize(f.size);
    cap.style.marginTop = '1em';
    host.appendChild(cap);
    $('welcome').classList.add('hidden');
    $('cmHost').classList.add('hidden');
    host.classList.remove('hidden');
    $('stLang').textContent = 'Image';
  } catch (e) { status('Could not open image'); }
}
function showBinary(path, size) {
  var host = $('viewHost');
  host.innerHTML = '';
  var p = document.createElement('p');
  p.textContent = basename(path) + ' looks like a binary file (' + fmtSize(size) + '), so there is nothing sensible to show.';
  host.appendChild(p);
  $('welcome').classList.add('hidden');
  $('cmHost').classList.add('hidden');
  host.classList.remove('hidden');
  $('stLang').textContent = 'Binary';
}
function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

var statusTimer = null;
function status(msg) {
  $('stMsg').textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(function () { $('stMsg').textContent = ''; }, 4000);
}

/* ------------------------------------------------------------------ *
 * Console
 * ------------------------------------------------------------------ */

var cwd = '';
var history = [];
var histIdx = -1;

function conOut(text, cls) {
  var d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text;
  $('conOut').appendChild(d);
  $('conOut').scrollTop = $('conOut').scrollHeight;
}
function conPrompt() {
  $('conPrompt').textContent = (cwd ? '~/' + cwd : '~') + ' $';
}

var CMDS = {
  help: function () {
    conOut('Commands run on the folder you opened. There is no shell here - a web page cannot start one.\n', 'dim');
    conOut([
      'ls [-a] [dir]      list a directory',
      'cd <dir>           change directory  (cd .. and cd / work)',
      'pwd                print the current directory',
      'cat <file>         print a file',
      'open <file>        open a file in the editor',
      'mkdir <dir>        create a directory',
      'touch <file>       create an empty file',
      'rm [-r] <path>     delete a file or directory',
      'mv <src> <dst>     move or rename',
      'cp <src> <dst>     copy a file or directory',
      'find <text>        search file names below here',
      'grep <text> [dir]  search inside text files',
      'tree [dir]         show the folder as a tree',
      'wc <file>          count lines, words, characters',
      'stat <path>        size and modified time',
      'echo <text> > file write text to a file (>> appends)',
      'check              what this browser allows, and the flags to fix it',
      'save               save the current editor tab',
      'clear              clear this output'
    ].join('\n'));
  },
  ls: async function (a) {
    var all = a[0] === '-a';
    if (all) a = a.slice(1);
    var t = resolve(cwd, a[0] || '.');
    var kids = await listDir(t, all);
    if (!kids.length) return conOut('(empty)', 'dim');
    kids.forEach(function (k) {
      conOut(k.kind === 'directory' ? k.name + '/' : k.name, k.kind === 'directory' ? 'd' : '');
    });
  },
  cd: async function (a) {
    var t = resolve(cwd, a[0] || '');
    if (t && (await exists(t)) !== 'directory') return conOut('cd: not a directory: ' + t, 'err');
    cwd = t;
    conPrompt();
  },
  pwd: function () { conOut('~/' + cwd); },
  cat: async function (a) {
    if (!a[0]) return conOut('cat: needs a file name', 'err');
    var p = resolve(cwd, a[0]);
    var r = await readText(p);
    if (r.binary) return conOut('cat: ' + p + ' is binary', 'err');
    conOut(r.text || '(empty file)');
  },
  open: async function (a) {
    if (!a[0]) return conOut('open: needs a file name', 'err');
    await openFile(resolve(cwd, a[0]));
  },
  mkdir: async function (a) {
    if (!a[0]) return conOut('mkdir: needs a name', 'err');
    await getDir(resolve(cwd, a[0]), true);
    clearCaches(); await renderTree();
    conOut('created ' + a[0] + '/', 'ok');
  },
  touch: async function (a) {
    if (!a[0]) return conOut('touch: needs a name', 'err');
    var p = resolve(cwd, a[0]);
    if (await exists(p)) return conOut('touch: already exists', 'err');
    await writeText(p, '');
    clearCaches(); await renderTree();
    conOut('created ' + a[0], 'ok');
  },
  rm: async function (a) {
    if (a[0] === '-r' || a[0] === '-rf') a = a.slice(1);
    if (!a[0]) return conOut('rm: needs a path', 'err');
    var p = resolve(cwd, a[0]);
    var k = await exists(p);
    if (!k) return conOut('rm: no such path: ' + a[0], 'err');
    await removePath(p);
    closeTab(p, true);
    await renderTree();
    conOut('removed ' + a[0], 'ok');
  },
  mv: async function (a) {
    if (a.length < 2) return conOut('mv: needs a source and a destination', 'err');
    var s = resolve(cwd, a[0]), d = resolve(cwd, a[1]);
    if ((await exists(d)) === 'directory') d = d + '/' + basename(s);
    await movePath(s, d);
    await renderTree();
    conOut(a[0] + ' \u2192 ' + a[1], 'ok');
  },
  cp: async function (a) {
    if (a.length < 2) return conOut('cp: needs a source and a destination', 'err');
    if (a[0] === '-r') a = a.slice(1);
    var s = resolve(cwd, a[0]), d = resolve(cwd, a[1]);
    if ((await exists(d)) === 'directory') d = d + '/' + basename(s);
    await copyTree(s, d);
    clearCaches(); await renderTree();
    conOut('copied to ' + a[1], 'ok');
  },
  find: async function (a) {
    if (!a[0]) return conOut('find: needs some text to look for', 'err');
    var q = a[0].toLowerCase(), hits = 0;
    await walk(cwd, function (p) {
      if (basename(p).toLowerCase().indexOf(q) >= 0) { conOut(p); hits++; }
    });
    conOut(hits + ' match' + (hits === 1 ? '' : 'es'), 'dim');
  },
  grep: async function (a) {
    if (!a[0]) return conOut('grep: needs some text to look for', 'err');
    var q = a[0], base = resolve(cwd, a[1] || '.'), hits = 0, files = [];
    await walk(base, function (p) { files.push(p); });
    for (var i = 0; i < files.length && hits < 200; i++) {
      try {
        var r = await readText(files[i]);
        if (r.binary || !r.text) continue;
        var lines = r.text.split('\n');
        for (var j = 0; j < lines.length && hits < 200; j++) {
          if (lines[j].indexOf(q) >= 0) {
            conOut(files[i] + ':' + (j + 1) + ': ' + lines[j].trim().slice(0, 160));
            hits++;
          }
        }
      } catch (e) {}
    }
    conOut(hits + ' match' + (hits === 1 ? '' : 'es'), 'dim');
  },
  tree: async function (a) {
    var base = resolve(cwd, a[0] || '.');
    async function rec(rel, pad, depth) {
      if (depth > 6) return;
      var kids = await listDir(rel);
      for (var i = 0; i < kids.length; i++) {
        var last = i === kids.length - 1;
        var k = kids[i];
        conOut(pad + (last ? '\u2514\u2500 ' : '\u251C\u2500 ') + k.name + (k.kind === 'directory' ? '/' : ''),
          k.kind === 'directory' ? 'd' : '');
        if (k.kind === 'directory') await rec(k.path, pad + (last ? '   ' : '\u2502  '), depth + 1);
      }
    }
    conOut((base || '~') + '/', 'd');
    await rec(base, '', 0);
  },
  wc: async function (a) {
    if (!a[0]) return conOut('wc: needs a file name', 'err');
    var r = await readText(resolve(cwd, a[0]));
    if (r.binary) return conOut('wc: binary file', 'err');
    var t = r.text;
    conOut(t.split('\n').length + ' lines, ' + (t.match(/\S+/g) || []).length + ' words, ' + t.length + ' characters');
  },
  stat: async function (a) {
    if (!a[0]) return conOut('stat: needs a path', 'err');
    var p = resolve(cwd, a[0]);
    var k = await exists(p);
    if (!k) return conOut('stat: no such path', 'err');
    if (k === 'directory') {
      var kids = await listDir(p, true);
      return conOut(p + '/ - directory, ' + kids.length + ' entries');
    }
    var fh = await getFileHandle(p), f = await fh.getFile();
    conOut(p + ' - ' + fmtSize(f.size) + ', modified ' + new Date(f.lastModified).toLocaleString());
  },
  echo: async function (a, rest) {
    var m = /^(.*?)\s*(>>|>)\s*(\S+)\s*$/.exec(rest);
    if (!m) return conOut(rest);
    var text = m[1].replace(/^["']|["']$/g, '');
    var p = resolve(cwd, m[3]);
    var prev = '';
    if (m[2] === '>>' && (await exists(p)) === 'file') prev = (await readText(p)).text || '';
    await writeText(p, prev + text + '\n');
    clearCaches(); await renderTree();
    conOut('wrote ' + m[3], 'ok');
  },
  check: function () { checksToConsole(); },
  save: function () { saveActive(); },
  clear: function () { $('conOut').innerHTML = ''; }
};
CMDS.dir = CMDS.ls;
CMDS.rmdir = CMDS.rm;
CMDS.edit = CMDS.open;
CMDS['?'] = CMDS.help;

async function walk(rel, fn, depth) {
  depth = depth || 0;
  if (depth > 8) return;
  var kids = await listDir(rel);
  for (var i = 0; i < kids.length; i++) {
    if (kids[i].kind === 'directory') await walk(kids[i].path, fn, depth + 1);
    else fn(kids[i].path);
  }
}

function tokenize(line) {
  var re = /"([^"]*)"|'([^']*)'|(\S+)/g, out = [], m;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  return out;
}

var NEEDS_NO_FOLDER = { help: 1, '?': 1, check: 1, clear: 1, pwd: 1 };

async function runCommand(line) {
  line = line.trim();
  conOut((cwd ? '~/' + cwd : '~') + ' $ ' + line, 'echo');
  if (!line) return;
  history.push(line);
  histIdx = history.length;
  var parts = tokenize(line);
  var name = parts[0];
  var args = parts.slice(1);
  var rest = line.slice(name.length).trim();
  if (!CMDS[name]) {
    conOut(name + ': not a command here. Type help for the list.', 'err');
    if (['python', 'python3', 'node', 'git', 'npm', 'pip', 'docker', 'make', 'go', 'cargo'].indexOf(name) >= 0) {
      conOut('Running programs needs a real shell, which a web page has no way to start.', 'dim');
    }
    return;
  }
  if (!root && !NEEDS_NO_FOLDER[name]) {
    return conOut('Open a folder first.', 'err');
  }
  try {
    await CMDS[name](args, rest);
  } catch (e) {
    conOut(name + ': ' + (e && e.message ? e.message : String(e)), 'err');
  }
}

async function consoleComplete(inp) {
  var val = inp.value;
  var m = /(\S*)$/.exec(val);
  var frag = m[1];
  var dir = frag.indexOf('/') >= 0 ? frag.slice(0, frag.lastIndexOf('/')) : '';
  var stub = frag.indexOf('/') >= 0 ? frag.slice(frag.lastIndexOf('/') + 1) : frag;
  if (!root) return;
  try {
    var kids = await listDir(resolve(cwd, dir), true);
    var hits = kids.filter(function (k) { return k.name.indexOf(stub) === 0; });
    if (!hits.length) return;
    if (hits.length === 1) {
      var done = (dir ? dir + '/' : '') + hits[0].name + (hits[0].kind === 'directory' ? '/' : '');
      inp.value = val.slice(0, val.length - frag.length) + done;
    } else {
      conOut(hits.map(function (h) { return h.name; }).join('   '), 'dim');
    }
  } catch (e) {}
}

/* ------------------------------------------------------------------ *
 * Find file (Ctrl+P)
 * ------------------------------------------------------------------ */

var fileIndex = null;
var palSel = 0;
var palHits = [];

async function buildIndex() {
  if (fileIndex) return fileIndex;
  var out = [];
  await walk('', function (p) { if (out.length < 8000) out.push(p); });
  fileIndex = out;
  return out;
}
async function openPalette() {
  if (!root) return status('Open a folder first');
  $('paletteWrap').classList.remove('hidden');
  $('paletteIn').value = '';
  $('paletteIn').focus();
  $('paletteList').innerHTML = '<div class="p-none">Reading the folder\u2026</div>';
  await buildIndex();
  filterPalette('');
}
function closePalette() { $('paletteWrap').classList.add('hidden'); }
function filterPalette(q) {
  q = q.toLowerCase().replace(/\s+/g, '');
  var list = fileIndex || [];
  palHits = [];
  for (var i = 0; i < list.length && palHits.length < 300; i++) {
    var p = list[i], lp = p.toLowerCase();
    if (!q) { palHits.push({ p: p, s: 0 }); continue; }
    var idx = 0, ok = true;
    for (var c = 0; c < q.length; c++) {
      idx = lp.indexOf(q[c], idx);
      if (idx < 0) { ok = false; break; }
      idx++;
    }
    if (ok) palHits.push({ p: p, s: basename(lp).indexOf(q) >= 0 ? 0 : 1 });
  }
  palHits.sort(function (a, b) { return a.s - b.s || a.p.length - b.p.length; });
  palSel = 0;
  renderPalette();
}
function renderPalette() {
  var box = $('paletteList');
  box.innerHTML = '';
  if (!palHits.length) {
    box.innerHTML = '<div class="p-none">No file matches that.</div>';
    return;
  }
  palHits.slice(0, 60).forEach(function (h, i) {
    var d = document.createElement('div');
    d.className = 'p-item' + (i === palSel ? ' sel' : '');
    var n = document.createElement('span');
    n.className = 'p-name';
    n.textContent = basename(h.p);
    var s = document.createElement('span');
    s.className = 'p-dir';
    s.textContent = dirname(h.p);
    d.appendChild(n);
    d.appendChild(s);
    d.onclick = function () { closePalette(); openFile(h.p); };
    box.appendChild(d);
  });
}

/* ------------------------------------------------------------------ *
 * Resizing
 * ------------------------------------------------------------------ */

function setupGrips() {
  var gv = $('gripV'), gh = $('gripH');

  gv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    gv.setPointerCapture(e.pointerId);
    gv.classList.add('dragging');
    function mv(ev) {
      S.sideW = Math.max(150, Math.min(ev.clientX, innerWidth - 260));
      document.documentElement.style.setProperty('--side-w', S.sideW + 'px');
    }
    function up() {
      gv.classList.remove('dragging');
      gv.removeEventListener('pointermove', mv);
      gv.removeEventListener('pointerup', up);
      saveSettings();
      if (cm) cm.refresh();
    }
    gv.addEventListener('pointermove', mv);
    gv.addEventListener('pointerup', up);
  });

  gh.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    gh.setPointerCapture(e.pointerId);
    gh.classList.add('dragging');
    var bottom = $('console').getBoundingClientRect().bottom;
    function mv(ev) {
      S.conH = Math.max(70, Math.min(bottom - ev.clientY, innerHeight - 180));
      document.documentElement.style.setProperty('--con-h', S.conH + 'px');
    }
    function up() {
      gh.classList.remove('dragging');
      gh.removeEventListener('pointermove', mv);
      gh.removeEventListener('pointerup', up);
      saveSettings();
      if (cm) cm.refresh();
    }
    gh.addEventListener('pointermove', mv);
    gh.addEventListener('pointerup', up);
  });

  gv.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      S.sideW = Math.max(150, Math.min(S.sideW + (e.key === 'ArrowRight' ? 16 : -16), innerWidth - 260));
      applySettings();
    }
  });
  gh.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      S.conH = Math.max(70, Math.min(S.conH + (e.key === 'ArrowUp' ? 16 : -16), innerHeight - 180));
      applySettings();
    }
  });
}

/* ------------------------------------------------------------------ *
 * Settings panel
 * ------------------------------------------------------------------ */

function bindSettings() {
  function sel(id, key, cast) {
    var el = $(id);
    el.value = S[key];
    el.onchange = function () { S[key] = cast ? cast(el.value) : el.value; applySettings(); };
  }
  function chk(id, key) {
    var el = $(id);
    el.checked = !!S[key];
    el.onchange = function () {
      S[key] = el.checked;
      applySettings();
      if (key === 'showHidden' || key === 'ignoreJunk') { clearCaches(); renderTree(); }
    };
  }
  function rng(id, outId, key) {
    var el = $(id), o = $(outId);
    el.value = S[key];
    o.value = S[key];
    el.oninput = function () { S[key] = +el.value; o.value = el.value; applySettings(); };
  }
  sel('setTheme', 'theme');
  sel('setCmTheme', 'cmTheme');
  sel('setTabSize', 'tabSize', Number);
  rng('setUiSize', 'outUiSize', 'uiSize');
  rng('setEdSize', 'outEdSize', 'edSize');
  rng('setConSize', 'outConSize', 'conSize');
  rng('setDensity', 'outDensity', 'density');
  chk('setSpaces', 'insertSpaces');
  chk('setTabComplete', 'tabComplete');
  chk('setWrap', 'wrap');
  chk('setNums', 'lineNumbers');
  chk('setActive', 'activeLine');
  chk('setBrackets', 'brackets');
  chk('setAutoSave', 'autoSave');
  chk('setHidden', 'showHidden');
  chk('setIgnore', 'ignoreJunk');

  $('btnCheck').onclick = function () { renderChecks($('checkPanel'), true); };

  $('btnReset').onclick = function () {
    S = Object.assign({}, DEFAULTS);
    applySettings();
    bindSettings();
    clearCaches();
    renderTree();
    status('Settings reset');
  };
}
function openSettings() { $('modalWrap').classList.remove('hidden'); }
function closeSettings() { $('modalWrap').classList.add('hidden'); }

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function wire() {
  $('btnOpen').onclick = pickFolder;
  $('btnOpen2').onclick = pickFolder;
  $('btnSettings').onclick = openSettings;
  $('btnCloseSettings').onclick = closeSettings;
  $('btnFind').onclick = openPalette;
  $('btnRefresh').onclick = async function () { clearCaches(); await renderTree(); status('Refreshed'); };
  $('btnNewFile').onclick = function () { newEntry(cwd, 'file'); };
  $('btnNewDir').onclick = function () { newEntry(cwd, 'dir'); };
  $('btnConClear').onclick = function () { $('conOut').innerHTML = ''; };

  var treeBox = $('tree');
  treeBox.addEventListener('dragover', function (ev) {
    if (!dragSrcPath) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    if (dropHighlightEl !== treeBox) { clearDropHighlight(); treeBox.classList.add('drop-target-root'); dropHighlightEl = treeBox; }
  });
  treeBox.addEventListener('dragleave', function (ev) {
    if (ev.target === treeBox && dropHighlightEl === treeBox) clearDropHighlight();
  });
  treeBox.addEventListener('drop', function (ev) {
    ev.preventDefault();
    var src = dragSrcPath;
    clearDropHighlight();
    if (src) moveIntoFolder(src, '');
  });

  $('promptWrap').onclick = function (e) { if (e.target === $('promptWrap')) $('btnPromptCancel').click(); };
  $('modalWrap').onclick = function (e) { if (e.target === $('modalWrap')) closeSettings(); };
  $('paletteWrap').onclick = function (e) { if (e.target === $('paletteWrap')) closePalette(); };

  $('console').addEventListener('click', function (e) {
    if (window.getSelection().toString()) return;
    if (e.target.tagName !== 'BUTTON') $('conIn').focus();
  });

  var inp = $('conIn');
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var v = inp.value;
      inp.value = '';
      runCommand(v);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      consoleComplete(inp);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histIdx > 0) { histIdx--; inp.value = history[histIdx] || ''; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx < history.length - 1) { histIdx++; inp.value = history[histIdx] || ''; }
      else { histIdx = history.length; inp.value = ''; }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      $('conOut').innerHTML = '';
    }
  });

  var pin = $('paletteIn');
  pin.addEventListener('input', function () { filterPalette(pin.value); });
  pin.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palSel + 1, Math.min(palHits.length, 60) - 1); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(palSel - 1, 0); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (palHits[palSel]) { closePalette(); openFile(palHits[palSel].p); } }
    else if (e.key === 'Escape') { closePalette(); }
  });

  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { closePalette(); closeSettings(); hideCtx(); $('promptWrap').classList.add('hidden'); return; }
    if (!mod) return;
    if (e.key === 's') { e.preventDefault(); saveActive(); }
    else if (e.key === 'p') { e.preventDefault(); openPalette(); }
    else if (e.key === 'b') { e.preventDefault(); S.sideOpen = !S.sideOpen; applySettings(); if (cm) cm.refresh(); }
    else if (e.key === ',') { e.preventDefault(); openSettings(); }
    else if (e.key === '`') { e.preventDefault(); S.conOpen = !S.conOpen; applySettings(); if (S.conOpen) $('conIn').focus(); }
  });

  addEventListener('beforeunload', function (e) {
    var dirty = false;
    openTabs.forEach(function (t) { if (t.dirty) dirty = true; });
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  addEventListener('resize', function () { if (cm) cm.refresh(); });
}

/* ------------------------------------------------------------------ *
 * Start & Browser Configuration Alert Helpers
 * ------------------------------------------------------------------ */

function browserInfo() {
  var ua = navigator.userAgent;
  if (navigator.brave && navigator.brave.isBrave) return { id: 'brave', name: 'Brave', flags: 'brave://flags' };
  if (/OPR\//.test(ua)) return { id: 'opera', name: 'Opera', flags: 'opera://flags' };
  if (/Edg\//.test(ua)) return { id: 'edge', name: 'Edge', flags: 'edge://flags' };
  if (/Firefox\//.test(ua)) return { id: 'firefox', name: 'Firefox', flags: null };
  if (/Chrome\//.test(ua)) return { id: 'chrome', name: 'Chrome', flags: 'chrome://flags' };
  if (/Safari\//.test(ua)) return { id: 'safari', name: 'Safari', flags: null };
  return { id: 'unknown', name: 'This browser', flags: null };
}

async function checkSpecificBrowserConfig() {
  var isBrave = false;
  try {
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
      isBrave = await navigator.brave.isBrave();
    }
  } catch (e) {}

  if (isBrave) {
    console.warn("Brave browser detected. Ensure File System Access APIs or permissions are correctly enabled.");
  }
}

function runChecks() {
  var b = browserInfo();
  var flagged = { brave: 1, opera: 1, chrome: 1, edge: 1 };
  var out = [];

  function add(what, ok, why, fix, flag) {
    out.push({ what: what, ok: ok, why: why, fix: fix, flag: flag });
  }

  add('Secure page', window.isSecureContext !== false,
    'Every capability below is switched off by browsers on plain http.',
    'Load this page over https, or from localhost while testing.');

  var fsFlag = flagged[b.id] ? b.flags + '/#file-system-access-api' : null;
  add('Open a folder', 'showDirectoryPicker' in window,
    'Without this, bench cannot read your project or write files back.',
    b.id === 'brave' ? 'Brave ships this switched off. Turn the flag on, then relaunch Brave.'
      : b.id === 'opera' ? 'Opera ships this switched off. Turn the flag on, then relaunch Opera.'
      : b.id === 'firefox' || b.id === 'safari' ? b.name + ' has not implemented this API at all. Chrome or Edge will work.'
      : 'Turn the flag on, then relaunch the browser.',
    fsFlag);

  add('Write files in place',
    !!(window.FileSystemFileHandle && window.FileSystemFileHandle.prototype && window.FileSystemFileHandle.prototype.createWritable),
    'Saving edits back to the original file needs this. Without it, Save can only download a copy.',
    'Use Chrome or Edge; Safari has the handles but not the writer.');

  var idbOk = false;
  try { idbOk = !!window.indexedDB; } catch (e) {}
  add('Remember the last folder', idbOk,
    'Bench stores the folder handle so it can offer to reopen it next visit.',
    'A private window or blocked site data will do this. Allow storage for this site, or use a normal window.');

  var lsOk = false;
  try { localStorage.setItem('bench.probe', '1'); localStorage.removeItem('bench.probe'); lsOk = true; } catch (e) {}
  add('Remember settings', lsOk,
    'Themes, sizes and pane widths live in local storage.',
    'Allow site data for this site.');

  add('Copy to clipboard', !!(navigator.clipboard && navigator.clipboard.writeText),
    'Used by Copy path in the file list. Nothing else depends on it.',
    'Some browsers only grant this on https or after a click.');

  add('Editor library', !NOCM,
    'CodeMirror is fetched from cdnjs for highlighting and completion.',
    'A blocker or offline machine will stop this. Editing still works in a plain text box.');

  return { browser: b, checks: out };
}

function renderChecks(host, showAll) {
  var r = runChecks();
  host.innerHTML = '';
  var shown = 0;

  r.checks.forEach(function (c) {
    if (c.ok && !showAll) return;
    shown++;
    var row = document.createElement('div');
    row.className = 'check ' + (c.ok ? 'ok' : 'bad');

    var mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = c.ok ? '\u2713' : '\u2717';
    row.appendChild(mark);

    var body = document.createElement('div');
    body.className = 'body';
    var what = document.createElement('div');
    what.className = 'what';
    what.textContent = c.what;
    body.appendChild(what);

    var why = document.createElement('div');
    why.className = 'why';
    why.textContent = c.ok ? c.why : c.fix;
    body.appendChild(why);

    if (!c.ok && c.flag) {
      var line = document.createElement('div');
      line.className = 'flagline';
      var code = document.createElement('code');
      code.textContent = c.flag;
      line.appendChild(code);
      var btn = document.createElement('button');
      btn.className = 'icon';
      btn.textContent = 'copy';
      btn.onclick = function () {
        if (navigator.clipboard) navigator.clipboard.writeText(c.flag);
        btn.textContent = 'copied';
        setTimeout(function () { btn.textContent = 'copy'; }, 1500);
      };
      line.appendChild(btn);
      var hint = document.createElement('span');
      hint.className = 'why';
      hint.textContent = 'paste in the address bar; links to flag pages are blocked';
      line.appendChild(hint);
      body.appendChild(line);
    }

    row.appendChild(body);
    host.appendChild(row);
  });

  if (!shown) {
    var d = document.createElement('div');
    d.className = 'check ok';
    d.textContent = '\u2713  ' + r.browser.name + ' allows everything bench needs.';
    host.appendChild(d);
  }
  host.classList.remove('hidden');
  return r;
}

function checksToConsole() {
  var r = runChecks();
  conOut(r.browser.name + ':', 'dim');
  r.checks.forEach(function (c) {
    conOut((c.ok ? '\u2713 ' : '\u2717 ') + c.what + (c.ok ? '' : ' - ' + c.fix), c.ok ? '' : 'err');
    if (!c.ok && c.flag) conOut('    ' + c.flag, 'd');
  });
}

async function main() {
  loadSettings();
  applySettings();
  bindSettings();
  wire();
  setupGrips();
  conPrompt();

  await checkSpecificBrowserConfig();

  var report = renderChecks($('checks'), false);
  var blocked = report.checks.filter(function (c) { return !c.ok; });
  if (blocked.length) {
    conOut(report.browser.name + ' is blocking ' + blocked.length + ' thing'
      + (blocked.length === 1 ? '' : 's') + ' bench needs. Type check for the details.', 'err');
  } else {
    $('checks').classList.add('hidden');
  }

  await bootEditor();
  if (NOCM) status('Editor library did not load; using a plain text box');
  applySettings();
  offerLastFolder();
  conOut('bench ready. Type help for what this console can do.', 'dim');
}

main();

})();
