// 共通テーマ定義
const THEMES = {
    white:     { '--color-bg-0':'#ffffff','--color-bg-1':'#e9e9e9','--color-bg-2':'#875e46','--color-text-0':'#3c3c3c','--color-text-1':'#000000','--color-accent-0':'#ffdcc8','--color-accent-1':'#e4873a' },
    dark:      { '--color-bg-0':'#000000','--color-bg-1':'#232323','--color-bg-2':'#875e46','--color-text-0':'#d1d1d1','--color-text-1':'#ffffff','--color-accent-0':'#815a44','--color-accent-1':'#e8af7f' },
    coffee:    { '--color-bg-0': '#1a1410','--color-bg-1': '#251e18','--color-bg-2': '#302820','--color-text-0': '#b3b3b3','--color-text-1': '#e6e6e6','--color-accent-0': '#5d4a37','--color-accent-1': '#9b7e64ff' },
    ocean:     { '--color-bg-0': '#0f1419','--color-bg-1': '#161d24','--color-bg-2': '#1d262f','--color-text-0': '#b3b3b3','--color-text-1': '#e6e6e6','--color-accent-0': '#2f567eff','--color-accent-1': '#739dc6ff' },
    forest:    { '--color-bg-0': '#0f1510','--color-bg-1': '#151d18','--color-bg-2': '#1b2520','--color-text-0': '#b3b3b3','--color-text-1': '#e6e6e6','--color-accent-0': '#3a4a3a','--color-accent-1': '#6f8e6fff' },
    sunset:    { '--color-bg-0': '#1a1218','--color-bg-1': '#251820','--color-bg-2': '#301e28','--color-text-0': '#b3b3b3','--color-text-1': '#e6e6e6','--color-accent-0': '#5a3a5a','--color-accent-1': '#8c648cff' },
    kawaii:    { '--color-bg-0': '#fff0f5','--color-bg-1': '#ffe4e1','--color-bg-2': '#ffb6c1','--color-text-0': '#c95995ff','--color-text-1': '#ff7cc2ff','--color-accent-0': '#ff69b4','--color-accent-1': '#ff7cc2ff' },
    'mono-dark':  { '--color-bg-0': '#0a0a0a','--color-bg-1': '#1a1a1a','--color-bg-2': '#333333','--color-text-0': '#999999','--color-text-1': '#cccccc','--color-accent-0': '#666666','--color-accent-1': '#aaaaaa' },
    'mono-white': { '--color-bg-0': '#fafafa','--color-bg-1': '#f0f0f0','--color-bg-2': '#cccccc','--color-text-0': '#666666','--color-text-1': '#333333','--color-accent-0': '#999999','--color-accent-1': '#555555' },
    paper:     { '--color-bg-0': '#f7f5f3','--color-bg-1': '#e8e5e0','--color-bg-2': '#d4c5a9','--color-text-0': '#5d5347','--color-text-1': '#2d2520','--color-accent-0': '#a67c52','--color-accent-1': '#8b5a3c' }
};

// コマンドレジストリ
class CommandRegistry {
    constructor() {
        this.map = new Map();
    }
    register(cmd) {
        if (!cmd || !cmd.cmd) return;
        this.map.set(cmd.cmd.toLowerCase(), cmd);
    }
    list() {
        return Array.from(this.map.values());
    }
}

// 外部JSからのコマンド登録窓口
window.RustyDocCommands = window.RustyDocCommands || {
    _pending: [],
    register(cmd) { this._pending.push(cmd); },
    list() { return []; }
};

// Share機能
class ShareFeature {
    static getSharePayload() {
        const url = location.href;
        const title = document.title || 'Untitled';
        // description欲しければmetaから拾うなど
        return { url, title, text: title };
    }

    static async copyText(text) {
        // Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        // fallback: execCommand
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    }

    static async shareAuto() {
        const { url, title, text } = ShareFeature.getSharePayload();

        // まず Web Share API（主にスマホ）
        if (navigator.share) {
            try {
                // navigator.canShare があればチェック（なくてもOK）
                if (!navigator.canShare || navigator.canShare({ url, title, text })) {
                    await navigator.share({ url, title, text });
                    return { kind: 'share-sheet' };
                }
            } catch (_) {
                // ユーザーキャンセル等は無視してフォールバック
            }
        }

        // 次にクリップボード（主にPC）
        const copied = await ShareFeature.copyText(url);
        if (copied) return { kind: 'clipboard', copied: url };

        // 最終手段
        try { window.prompt('Copy this URL:', url); } catch (_) {}
        return { kind: 'prompt', copied: url };
    }

    static async copyUrl() {
        const { url } = ShareFeature.getSharePayload();
        await ShareFeature.copyText(url);
        return { kind: 'clipboard', copied: url };
    }

    static async copyMarkdownLink() {
        const { url, title } = ShareFeature.getSharePayload();
        const md = `[${title}](${url})`;
        await ShareFeature.copyText(md);
        return { kind: 'clipboard', copied: md };
    }

    static register() {
        window.RustyDocCommands.register({
            cmd: 'Share',
            desc: 'Share this page (mobile: share sheet / desktop: copy URL)',
            keepOpen: false,
            sortIndex: 85,
            getCandidates: (parts) => {
                if (!parts || parts.length < 1 || parts[0].toLowerCase() !== 'share') return [];
                const arg = (parts[1] || '').toLowerCase();

                const candidates = [
                    { cmd: 'Share', desc: 'Auto (share sheet or copy URL)', sortIndex: 85, action: () => ShareFeature.shareAuto() },
                    { cmd: 'Share Url', desc: 'Copy page URL', sortIndex: 84, action: () => ShareFeature.copyUrl() },
                    { cmd: 'Share Markdown', desc: 'Copy [title](url)', sortIndex: 83, action: () => ShareFeature.copyMarkdownLink() },
                ];

                if (!arg) return candidates;
                return candidates.filter(c => c.cmd.toLowerCase().includes(`share ${arg}`));
            },
            action: (args) => {
                const a = (args[0] || '').toLowerCase();
                if (a === 'url') return ShareFeature.copyUrl();
                if (a === 'markdown') return ShareFeature.copyMarkdownLink();
                return ShareFeature.shareAuto();
            }
        });
    }
}

// Scroll機能
class ScrollFeature {
    static scrollPercent(percent) {
        const p = Math.min(Math.max(parseFloat(percent), 0), 100);
        const mainElement = document.querySelector('html');
        if (mainElement) {
            const maxScroll = mainElement.scrollHeight - mainElement.clientHeight;
            const target = maxScroll * (p / 100);
            mainElement.scrollTo({ top: target, behavior: 'smooth' });
        } else {
            const doc = document.documentElement;
            const maxScroll = doc.scrollHeight - window.innerHeight;
            const target = maxScroll * (p / 100);
            window.scrollTo({ top: target, behavior: 'smooth' });
        }
    }

    static register() {
        window.RustyDocCommands.register({
            cmd: 'Scroll',
            desc: 'Scroll to top (0%) or to specified percent',
            getCandidates: (parts) => {
                if (!parts || parts.length < 1 || parts[0].toLowerCase() !== 'scroll') return [];
                const arg = parts[1] || '0';
                return [{
                    cmd: `Scroll ${arg}`,
                    desc: `Scroll to ${arg}%`,
                    sortIndex: 50,
                    action: () => ScrollFeature.scrollPercent(arg)
                }];
            },
            sortIndex: 50,
            action: (args) => ScrollFeature.scrollPercent(args[0] || '0')
        });
    }
}

// Section/Jump機能
class SectionFeature {
    static extractSections() {
        const headings = Array.from(document.querySelectorAll('article h1, article h2, article h3, article h4, article h5, article h6'));
        const items = [];
        const stack = [];

        headings.forEach((h, idx) => {
            const title = (h.textContent || '').trim();
            if (!title) return;

            const level = parseInt(h.tagName.replace('H', ''), 10) || 1;
            while (stack.length >= level) stack.pop();
            stack.push(title);

            const section = h.closest('section[id]');
            const target = section || h;
            const id = target.id || h.id || `section-${idx}`;
            const path = stack.join(' > ');

            items.push({
                cmd: `Jump ${path}`,
                desc: `Section (${stack.length})`,
                sortIndex: 70,
                action: () => {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (id) {
                        try {
                            history.replaceState(null, '', `#${id}`);
                        } catch (_) {
                            location.hash = `#${id}`;
                        }
                    }
                }
            });
        });
        return items;
    }

    static register() {
        window.RustyDocCommands.register({
            cmd: 'Jump',
            desc: 'Jump to page sections',
            keepOpen: true,
            sortIndex: 70,
            getCandidates: (parts) => {
                if (!parts || parts.length === 0 || parts[0].toLowerCase() !== 'jump') return [];
                const query = parts.join(' ').toLowerCase();
                const sections = SectionFeature.extractSections();
                return sections.filter(cmd =>
                    cmd.cmd.toLowerCase().includes(query) || cmd.desc.toLowerCase().includes(query)
                );
            },
            action: () => {}
        });
    }
}

// Match機能
class MatchFeature {
    static getArticleMatches(queryText, limit = 20) {
        const root = document.querySelector('article');
        if (!root || !queryText) return [];

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const results = [];
        const qLower = queryText.toLowerCase();
        while (walker.nextNode() && results.length < limit) {
            const node = walker.currentNode;
            const text = node.nodeValue;
            let start = 0;
            const lower = text.toLowerCase();
            while (results.length < limit) {
                const idx = lower.indexOf(qLower, start);
                if (idx < 0) break;
                const previewStart = Math.max(0, idx - 12);
                const previewEnd = Math.min(text.length, idx + queryText.length + 12);
                const preview = text.slice(previewStart, previewEnd).replace(/\s+/g, ' ').trim();
                results.push({ node, start: idx, length: queryText.length, preview });
                start = idx + queryText.length;
            }
        }

        return results;
    }

    static jumpToMatch(match) {
        const root = document.querySelector('article');
        if (!root || !match || !match.node) return;

        root.querySelectorAll('mark[data-match-flash="true"]').forEach(m => {
            const text = document.createTextNode(m.textContent || '');
            m.replaceWith(text);
        });

        const node = match.node;
        const text = node.nodeValue || '';
        if (match.start < 0 || match.start >= text.length) return;

        const before = document.createTextNode(text.slice(0, match.start));
        const mark = document.createElement('mark');
        mark.className = 'match-flash';
        mark.setAttribute('data-match-flash', 'true');
        mark.textContent = text.slice(match.start, match.start + match.length);
        const after = document.createTextNode(text.slice(match.start + match.length));
        node.replaceWith(before, mark, after);
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
            if (mark.parentNode) {
                const t = document.createTextNode(mark.textContent || '');
                mark.replaceWith(t);
            }
        }, 2500);
    }

    static register() {
        window.RustyDocCommands.register({
            cmd: 'Match',
            desc: 'Find text in article',
            keepOpen: true,
            getCandidates: (parts) => {
                if (!parts || parts.length < 1 || parts[0].toLowerCase() !== 'match') return [];
                const queryText = parts.slice(1).join(' ').trim();
                if (!queryText) {
                    return [{
                        cmd: 'Match <text>',
                        desc: 'Type text to search in article',
                        keepOpen: true,
                        sortIndex: 60,
                        action: () => {},
                        complete: false
                    }];
                }
                const matches = MatchFeature.getArticleMatches(queryText, 20);
                if (matches.length === 0) {
                    return [{
                        cmd: `Match ${queryText}`,
                        desc: 'No matches',
                        keepOpen: true,
                        sortIndex: 60,
                        action: () => {},
                        complete: false
                    }];
                }
                return matches.map((m, i) => ({
                    cmd: `Match ${i + 1}: ${m.preview}`,
                    desc: 'Jump to match',
                    sortIndex: 60,
                    action: () => MatchFeature.jumpToMatch(m)
                }));
            },
            sortIndex: 60,
            action: () => {}
        });
    }
}

// ====================
// コマンドコンポーネント
// ====================

class CommandComponent {
    register(_api, _ctx) {
        throw new Error('register() must be implemented');
    }
}

class CoreCommands extends CommandComponent {
    register(api) {
        api.register({
            cmd: "Go",
            desc: "Go navigation commands",
            keepOpen: true,
            getCandidates: (parts) => {
                if (!parts || parts.length < 1 || parts[0].toLowerCase() !== 'go') return [];
                return [
                    { cmd: 'Go Root', desc: 'Navigate to root page', sortIndex: 100, action: () => window.location.assign("/") }
                ];
            },
            sortIndex: 100,
            action: () => {}
        });
    }
}

class BrowserCommands extends CommandComponent {
    register(api) {
        api.register({
            cmd: 'Browser',
            desc: 'Browser navigation commands',
            keepOpen: true,
            getCandidates: (parts) => {
                if (!parts || parts.length < 1 || parts[0].toLowerCase() !== 'browser') return [];
                return [
                    { cmd: 'Browser Back', desc: 'Go back in browser history', sortIndex: 90, action: () => history.back() },
                    { cmd: 'Browser Forward', desc: 'Go forward in browser history', sortIndex: 90, action: () => history.forward() },
                    { cmd: 'Browser Reload', desc: 'Reload current page', sortIndex: 90, action: () => location.reload() }
                ];
            },
            sortIndex: 90,
            action: () => {}
        });
    }
}

class ThemeCommands extends CommandComponent {
    register(api, ctx) {
        api.register({
            cmd: 'Theme',
            desc: 'Change color theme',
            keepOpen: true,
            getCandidates: (parts) => {
                if (!parts || parts.length < 1 || parts[0].toLowerCase() !== 'theme') return [];
                const term = (parts[1] || '').toLowerCase();
                return Object.keys(ctx.state.themes)
                    .filter(theme => theme.toLowerCase().includes(term))
                    .map(theme => ({
                        cmd: `Theme ${theme}`,
                        desc: `Change to ${theme} theme`,
                        sortIndex: 80,
                        action: () => ctx.features.theme.changeTheme([theme])
                    }));
            },
            sortIndex: 80,
            action: () => {}
        });
    }
}

// ====================
// UI機能（app依存）
// ====================

class FeatureComponent {
    register(app) {
        this.app = app;
        return this;
    }
}

class SearchFeature extends FeatureComponent {
    scheduleSearch(raw) {
        const app = this.app;
        const q = raw.trim();
        if(app.state.searchTimer){
            clearTimeout(app.state.searchTimer);
            app.state.searchTimer = null;
        }
        if(!q){
            this.abortActiveSearch();
            app.state.searchResults = [];
            app.features.commands.buildCombined();
            app.features.commands.renderResults(app.ui.resultsDiv);
            return;
        }
        app.state.searchTimer = setTimeout(()=>{
            if(q === app.state.lastSearchQuery) return;
            this.performSearch(q);
        }, 100);
    }

    abortActiveSearch(){
        const app = this.app;
        if(app.state.activeSearchAbort){
            app.state.activeSearchAbort.abort();
            app.state.activeSearchAbort = null;
        }
    }

    async performSearch(q){
        const app = this.app;
        this.abortActiveSearch();
        const ac = new AbortController();
        app.state.activeSearchAbort = ac;
        app.state.lastSearchQuery = q;
        try {
            const url = `/api/search?query=${encodeURIComponent(q)}&range=0..10&algo=CosineSimilarity`;
            const resp = await fetch(url, { signal: ac.signal });
            if(!resp.ok){
                if(resp.status === 404){
                    app.state.searchResults = [];
                    app.features.commands.buildCombined();
                    app.features.commands.renderResults(app.ui.resultsDiv);
                }
                return;
            }
            const ct = resp.headers.get('content-type')||'';
            if(!ct.includes('application/json')) return;
            const data = await resp.json();
            if(!data || !Array.isArray(data.results)) return;
            app.state.searchResults = data.results.map(r => ({
                title: r.title,
                url: r.url,
                descriptions: r.descriptions,
                favicon: r.favicon,
                score: r.score
            }));
            app.features.commands.buildCombined();
            app.features.commands.renderResults(app.ui.resultsDiv);
        } catch(e){
            if(e.name === 'AbortError') return;
        }
    }
}

class CommandPaletteFeature extends FeatureComponent {
    filterCommands(query, resultsDiv) {
        const app = this.app;
        const trimmed = query.trim();
        const parts = trimmed ? trimmed.split(/\s+/) : [];
        const q = query.toLowerCase();
        const tokens = q.split(/\s+/).filter(Boolean);
        
        const baseCommands = app.registry.list().filter(cmd => !cmd.hideInRoot);
        let filtered = baseCommands.filter(cmd => {
            if (tokens.length === 0) return true;
            const cmdText = cmd.cmd.toLowerCase();
            const descText = cmd.desc.toLowerCase();
            return tokens.every(t => cmdText.includes(t) || descText.includes(t));
        });
        
        // Dynamic candidate generation (部分一致)
        const head = (parts[0] || '').toLowerCase();
        const candidateHosts = head
            ? baseCommands.filter(cmd => cmd.cmd.toLowerCase().includes(head))
            : baseCommands;
        const candidates = [];
        candidateHosts.forEach(cmd => {
            if (typeof cmd.getCandidates === 'function') {
                const dynamicCandidates = cmd.getCandidates(parts);
                if (dynamicCandidates && dynamicCandidates.length > 0) {
                    dynamicCandidates.forEach(c => {
                        candidates.push({ _candidate: true, ...c });
                    });
                }
            }
        });
        
        app.state.filteredCommands = candidates.length > 0 ? candidates : filtered;

        const hadSelection = app.state.selectedIndex >= 0;
        this.buildCombined();
        if(!hadSelection) app.state.selectedIndex = app.state.combinedItems.length>0 ? 0 : -1;
        this.renderResults(resultsDiv);
    }

    renderResults(resultsDiv) {
        const app = this.app;
        if (app.state.combinedItems.length === 0) {
            resultsDiv.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--color-text-2);">No commands</div>';
            return;
        }
        function escapeHtml(s){
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        }
        resultsDiv.innerHTML = app.state.combinedItems.map((item, idx) => {
            if(item.type === 'command'){
                const cmd = item;
                return `
                    <div class="palette-item ${idx === app.state.selectedIndex ? 'selected' : ''}" data-idx="${idx}" data-kind="command">
                        <div>
                            <div class="palette-item-title">${escapeHtml(cmd.cmd)}</div>
                            <div class="palette-item-desc">${escapeHtml(cmd.desc)}</div>
                        </div>
                    </div>`;
            } else {
                const r = item;
                const favicon = r.favicon ? `<img src="${escapeHtml(r.favicon)}" style="width:14px;height:14px;object-fit:contain;filter:brightness(0.9);" loading="lazy"/>` : '';
                const safeTitle = r.title ? escapeHtml(r.title) : escapeHtml(r.url);
                const score = r.score != null ? ` <span style="opacity:0.6;font-size:11px;">${escapeHtml(r.score.toFixed(1))}</span>` : '';
                return `
                    <div class="palette-item ${idx === app.state.selectedIndex ? 'selected' : ''}" data-idx="${idx}" data-kind="search">
                        ${favicon}
                        <div>
                            <div class="palette-item-title" style="display:flex;gap:4px;align-items:center;">${safeTitle}${score}</div>
                            <div class="palette-item-desc" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:480px;">${escapeHtml(r.descriptions||'')}</div>
                        </div>
                    </div>`;
            }
        }).join('');

        resultsDiv.querySelectorAll('.palette-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.idx);
                const list = app.state.combinedItems || [];
                const entry = list[idx];
                if (entry && entry.type === 'command') {
                    const isComplete = entry._candidate && entry.complete !== false;
                    if (!isComplete) {
                        app.ui.inputField.value = entry.cmd;
                        this.filterCommands(app.ui.inputField.value, app.ui.resultsDiv);
                        setTimeout(() => {
                            app.ui.inputField.setSelectionRange(app.ui.inputField.value.length, app.ui.inputField.value.length);
                        }, 0);
                        return;
                    }
                }
                this.executeCombined(idx);
            });
        });

        const selected = resultsDiv.querySelector('.palette-item.selected');
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    buildCombined(){
        const app = this.app;
        const searchItems = app.state.searchResults.map(r => ({...r, type:'search'}));
        const commandItems = app.state.filteredCommands.map((c, i) => ({
            type: 'command',
            cmd: c.cmd,
            desc: c.desc,
            action: c.action,
            keepOpen: c.keepOpen,
            _candidate: c._candidate,
            complete: c.complete,
            sortIndex: (typeof c.sortIndex === 'number' ? c.sortIndex : 0),
            _origIndex: i,
        }));
        commandItems.sort((a, b) => {
            if (b.sortIndex !== a.sortIndex) return b.sortIndex - a.sortIndex;
            return a._origIndex - b._origIndex;
        });
        app.state.combinedItems = [...commandItems, ...searchItems];
    }

    getCombined(){
        return this.app.state.combinedItems || [];
    }

    executeCombined(idx){
        const app = this.app;
        const list = this.getCombined();
        const item = list[idx];
        if(!item) return;
        if(item.type === 'command'){
            if(typeof item.action === 'function'){
                const cmdParts = app.ui.inputField.value.trim().split(/\s+/);
                const args = cmdParts.slice(1);
                try {
                    const result = item.action(args);
                    if (result && typeof result.then === 'function') {
                        result
                            .then(res => console.log('[command]', item.cmd, { args, result: res }))
                            .catch(err => console.error('Command action error', err));
                    } else {
                        console.log('[command]', item.cmd, { args, result });
                    }
                } catch(e){
                    console.error('Command action error', e);
                }
                if (!item.keepOpen) app.hidePalette();
            }
        } else if(item.type === 'search'){
            if(item.url){
                try {
                    window.open(item.url, '_blank', 'noopener');
                } catch(e){
                    location.href = item.url;
                }
                app.hidePalette();
            }
        }
    }

    handleKeyNavigation(e) {
        const app = this.app;
        const list = this.getCombined();
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            app.state.selectedIndex = Math.min(app.state.selectedIndex + 1, list.length - 1);
            this.renderResults(app.ui.resultsDiv);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            app.state.selectedIndex = Math.max(app.state.selectedIndex - 1, 0);
            this.renderResults(app.ui.resultsDiv);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const item = list[app.state.selectedIndex];
            if (item && item.type === 'command') {
                app.ui.inputField.value = item.cmd;
                this.filterCommands(app.ui.inputField.value, app.ui.resultsDiv);
                setTimeout(() => {
                    app.ui.inputField.setSelectionRange(app.ui.inputField.value.length, app.ui.inputField.value.length);
                }, 0);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const input = app.ui.inputField.value.trim().toLowerCase();
            const exactIdx = list.findIndex(item =>
                item.type === 'command' && item.cmd.toLowerCase() === input
            );
            if (exactIdx >= 0) {
                const entry = list[exactIdx];
                const isComplete = entry._candidate && entry.complete !== false;
                if (isComplete) {
                    this.executeCombined(exactIdx);
                } else {
                    app.ui.inputField.value = entry.cmd;
                    this.filterCommands(app.ui.inputField.value, app.ui.resultsDiv);
                    setTimeout(() => {
                        app.ui.inputField.setSelectionRange(app.ui.inputField.value.length, app.ui.inputField.value.length);
                    }, 0);
                }
                return;
            }
            if (app.state.selectedIndex >= 0 && list[app.state.selectedIndex]) {
                this.executeCombined(app.state.selectedIndex);
            }
        } else if (e.key === 'Escape') {
            app.hidePalette();
        }
    }
}

class ThemeFeature extends FeatureComponent {
    changeTheme(args) {
        const app = this.app;
        const themeName = args && args[0] ? args[0].toLowerCase() : 'ocean';

        if (!app.state.themes[themeName]) {
            console.log(`Unknown theme: ${themeName}. Available themes: ${Object.keys(app.state.themes).join(', ')}`);
            return;
        }
        const theme = app.state.themes[themeName];
        const root = document.documentElement;
        Object.entries(theme).forEach(([property, value]) => {
            root.style.setProperty(property, value);
        });
        localStorage.setItem('selectedTheme', themeName);
        console.log(`Theme changed to: ${themeName}`);
    }
}

class AccountFeature extends FeatureComponent {
    async updateAccountStatus(){
        const app = this.app;
        if(!app.ui.accountBox) return;
        try {
            const resp = await fetch('/api/session', { credentials: 'include' });
            if(resp.status === 401){
                app.ui.accountBox.innerHTML = 'Current account: guest (<a href="/login">login</a>)';
                app.ui.accountBox.style.opacity = '1';
                return;
            }
            if(!resp.ok){
                app.ui.accountBox.innerHTML = '<p>Current account: *offline*</p>';
                app.ui.accountBox.style.opacity = '0.6';
                return;
            }
            const ct = resp.headers.get('content-type')||'';
            if(!ct.includes('application/json')){
                app.ui.accountBox.innerHTML = '<p>Current account: *invalid*</p>';
                app.ui.accountBox.style.opacity = '0.6';
                return;
            }
            const data = await resp.json();

            if(!data || typeof data !== 'object'){
                app.ui.accountBox.innerHTML = 'Current account: guest (<a href="/login">login</a>)';
                app.ui.accountBox.style.opacity = '1';
                return;
            }

            if(!data.is_logged_in){
                app.ui.accountBox.innerHTML = 'Current account: guest (<a href="/login">login</a>)';
                app.ui.accountBox.style.opacity = '1';
                return;
            }

            const acc = data.logged_account ?? 'user';
            const name = typeof acc === 'string' ? acc : String(acc);
            app.ui.accountBox.innerHTML = `<p>Current account: <b>${name}</b></p>`;
            app.ui.accountBox.style.opacity = '1';
        } catch(e){
            app.ui.accountBox.innerHTML = '<p>Current account: *offline*</p>';
            app.ui.accountBox.style.opacity = '0.55';
        }
    }
}

// DOM構築前に即テーマを適用
;(function(){
    const name = (localStorage.getItem('selectedTheme')||'ocean').toLowerCase();
    const theme = THEMES[name] || THEMES.ocean;
    Object.entries(theme).forEach(([prop,val]) => document.documentElement.style.setProperty(prop,val));
})();

document.addEventListener('DOMContentLoaded', () => {
    class ConsoleEmulator {
        constructor() {
            // メニューボタン作成
            const menuBtn = document.createElement('button');
            menuBtn.id = 'command-palette-btn';
            menuBtn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;width:44px;height:44px;padding:0;border-radius:0;background:var(--color-bg-1);color:var(--color-text-1);border:1px solid var(--color-bg-2);box-shadow:0 2px 8px rgba(0,0,0,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s ease';
            menuBtn.setAttribute('aria-label', 'Open command palette');

            const paletteIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            paletteIcon.setAttribute('width', '20');
            paletteIcon.setAttribute('height', '20');
            paletteIcon.setAttribute('viewBox', '0 0 24 24');
            paletteIcon.innerHTML = '<path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>';
            
            const closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            closeIcon.setAttribute('width', '18');
            closeIcon.setAttribute('height', '18');
            closeIcon.setAttribute('viewBox', '0 0 24 24');
            closeIcon.innerHTML = '<path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>';
            menuBtn.appendChild(paletteIcon);

            const overlay = document.createElement('div');
            overlay.id = 'command-palette-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);z-index:99998;display:none';

            const paletteDiv = document.createElement('div');
            paletteDiv.id = 'command-palette-div';
            paletteDiv.style.cssText = 'position:fixed;left:50%;top:10%;transform:translateX(-50%);width:min(600px,95vw);max-height:60vh;background:var(--color-bg-0);color:var(--color-text-1);border:1px solid var(--color-bg-2);box-shadow:0 8px 24px rgba(0,0,0,0.3);border-radius:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden;z-index:100000';

            const inputContainer = document.createElement('div');
            inputContainer.style.cssText = 'padding:12px;border-bottom:1px solid var(--color-bg-2);display:flex;align-items:center;gap:8px';

            const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            searchIcon.setAttribute('width', '18');
            searchIcon.setAttribute('height', '18');
            searchIcon.setAttribute('viewBox', '0 0 24 24');
            searchIcon.style.color = 'var(--color-text-2)';
            searchIcon.innerHTML = '<path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>';

            const inputField = document.createElement('input');
            inputField.type = 'text';
            inputField.id = 'palette-input';
            inputField.placeholder = 'Type a command... (/ to open, ESC to close)';
            inputField.style.cssText = 'flex:1;background:transparent;border:none;outline:none;color:var(--color-text-1);font-size:16px;font-family:inherit;margin:0';
            inputField.autocomplete = 'off';
            inputField.spellcheck = false;

            inputContainer.appendChild(searchIcon);
            inputContainer.appendChild(inputField);

            const resultsDiv = document.createElement('div');
            resultsDiv.id = 'palette-results';
            resultsDiv.style.cssText = 'max-height:400px;overflow-y:auto;padding:8px 0';

            paletteDiv.appendChild(inputContainer);
            paletteDiv.appendChild(resultsDiv);

            // UI/状態
            this.ui = { menuBtn, overlay, paletteIcon, closeIcon, inputField, resultsDiv, paletteDiv };
            this.state = {
                themes: THEMES,
                selectedIndex: -1,
                filteredCommands: [],
                combinedItems: [],
                searchResults: [],
                searchTimer: null,
                lastSearchQuery: '',
                activeSearchAbort: null,
            };

            // コマンドレジストリ
            this.registry = new CommandRegistry();

            // 外部登録APIを有効化
            window.RustyDocCommands.register = (cmd) => this.registry.register(cmd);
            window.RustyDocCommands.list = () => this.registry.list();
            if (Array.isArray(window.RustyDocCommands._pending)) {
                window.RustyDocCommands._pending.forEach(cmd => this.registry.register(cmd));
                window.RustyDocCommands._pending = [];
            }

            // 機能モジュール初期化
            this.features = {
                commands: new CommandPaletteFeature().register(this),
                theme: new ThemeFeature().register(this),
                account: new AccountFeature().register(this),
                search: new SearchFeature().register(this),
            };
            this.commands = this.features.commands;

            // 独立機能を登録
            ScrollFeature.register();
            MatchFeature.register();
            SectionFeature.register();
            ShareFeature.register();

            // コマンド登録（外部API経由）
            [
                new CoreCommands(),
                new BrowserCommands(),
                new ThemeCommands(),
            ].forEach(c => c.register({ register: (cmd) => window.RustyDocCommands.register(cmd) }, this));

            // 初期化
            this.isAnimating = false;

            // イベント設定
            this.setupEvents(menuBtn, overlay, paletteIcon, closeIcon, inputField, resultsDiv);

            // DOM追加
            document.body.appendChild(menuBtn);
            document.body.appendChild(overlay);
            overlay.appendChild(paletteDiv);

            // アカウントステータス
            const accountBox = document.createElement('div');
            accountBox.id = 'account-status';
            accountBox.textContent = 'Current account: ...';
            accountBox.style.cssText = 'margin:0;padding:6px 12px 10px 12px;font-size:14px;border-top:1px solid var(--color-bg-2);background:var(--color-bg-0);user-select:none';
            const footerWrap = document.createElement('div');
            footerWrap.style.cssText = 'display:flex;flex-direction:column;max-height:28px';
            footerWrap.appendChild(accountBox);
            paletteDiv.appendChild(footerWrap);

            this.ui.accountBox = accountBox;
            this.features.account.updateAccountStatus();
            setInterval(()=> this.features.account.updateAccountStatus(), 60000);

            this.addAnimations();
        }

        addAnimations() {
            const style = document.createElement('style');
            style.textContent = `
                @keyframes fadeIn { from{opacity:0}to{opacity:1} }
                @keyframes fadeOut { from{opacity:1}to{opacity:0} }
                @keyframes slideIn { from{opacity:0;transform:translateX(-50%) translateY(-30px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
                @keyframes slideOut { from{opacity:1;transform:translateX(-50%) translateY(0)}to{opacity:0;transform:translateX(-50%) translateY(-30px)} }
                @keyframes matchFlash { from{background-color:var(--color-accent-1);color:var(--color-text-1)}to{background-color:transparent;color:inherit} }
                mark.match-flash { animation:matchFlash 2.5s ease }
                #command-palette-overlay.show { animation:fadeIn 0.2s ease forwards }
                #command-palette-overlay.hide { animation:fadeOut 0.2s ease forwards }
                #command-palette-div.show { animation:slideIn 0.2s ease forwards }
                #command-palette-div.hide { animation:slideOut 0.2s ease forwards }
                .palette-item { padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background-color 0.1s ease;border-radius:0;margin:0 4px }
                .palette-item:hover,.palette-item.selected { background-color:var(--color-bg-2) }
                .palette-item-title { font-weight:500;color:var(--color-text-1);font-size:14px }
                .palette-item-desc { color:var(--color-text-2);font-size:12px;margin-top:1px }
            `;
            document.head.appendChild(style);
        }

        setupEvents(menuBtn, overlay, paletteIcon, closeIcon, inputField, resultsDiv) {
            menuBtn.onclick = () => this.togglePalette();

            document.addEventListener('keydown', e => {
                if (((e.ctrlKey && e.shiftKey && e.key === 'P') || 
                    (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey)) &&
                    !this.isVisible() &&
                    !(document.activeElement.tagName.match(/INPUT|TEXTAREA/) || document.activeElement.isContentEditable)) {
                    e.preventDefault();
                    this.showPalette();
                } else if (e.key === 'Escape' && this.isVisible()) {
                    this.hidePalette();
                }
            });

            inputField.addEventListener('input', e => {
                const val = e.target.value;
                this.features.commands.filterCommands(val, resultsDiv);
                this.features.search.scheduleSearch(val);
            });
            inputField.addEventListener('keydown', e => this.features.commands.handleKeyNavigation(e));

            overlay.addEventListener('click', e => {
                if (e.target === overlay) this.hidePalette();
            });
        }

        togglePalette() {
            if (this.isVisible()) {
                this.hidePalette();
            } else {
                this.showPalette();
            }
        }

        isVisible() {
            return this.ui.overlay.style.display === 'block';
        }

        showPalette() {
            if (this.isAnimating) return;
            this.isAnimating = true;
            
            this.ui.overlay.style.display = 'block';
            this.ui.overlay.className = '';
            document.getElementById('command-palette-div').className = '';
            
            requestAnimationFrame(() => {
                this.ui.overlay.classList.add('show');
                document.getElementById('command-palette-div').classList.add('show');
            });
            
            this.ui.menuBtn.innerHTML = '';
            this.ui.menuBtn.appendChild(this.ui.closeIcon);
            this.features.account.updateAccountStatus();
            this.ui.menuBtn.setAttribute('aria-label', 'Close command palette');

            setTimeout(() => {
                this.ui.inputField.focus();
                this.features.commands.filterCommands('', this.ui.resultsDiv);
                this.isAnimating = false;
            }, 100);
        }

        hidePalette() {
            if (this.isAnimating) return;
            this.isAnimating = true;
            
            this.ui.overlay.className = '';
            document.getElementById('command-palette-div').className = '';
            
            requestAnimationFrame(() => {
                this.ui.overlay.classList.add('hide');
                document.getElementById('command-palette-div').classList.add('hide');
            });
            
            this.ui.menuBtn.innerHTML = '';
            this.ui.menuBtn.appendChild(this.ui.paletteIcon);
            this.ui.menuBtn.setAttribute('aria-label', 'Open command palette');

            this.ui.inputField.value = '';
            this.state.selectedIndex = -1;
            
            setTimeout(() => {
                this.ui.overlay.style.display = 'none';
                this.ui.overlay.className = '';
                document.getElementById('command-palette-div').className = '';
                this.isAnimating = false;
            }, 200);
        }
    }

    new ConsoleEmulator();
});
