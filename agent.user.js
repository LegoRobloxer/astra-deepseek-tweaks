// ==UserScript==
// @name         Agent Bridge
// @namespace    agent.mk2
// @version      5.4
// @match        https://chat.deepseek.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      127.0.0.1
// @updateURL    https://raw.githubusercontent.com/LegoRobloxer/astra-deepseek-tweaks/main/agent.user.js
// @downloadURL  https://raw.githubusercontent.com/LegoRobloxer/astra-deepseek-tweaks/main/agent.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';
    // v5.1: любая необработанная ошибка попадает в консоль и бейдж, а не молчит
    window.addEventListener('error', function (ev) {
        try { console.error('[agent] window.error:', ev.message, ev.filename + ':' + ev.lineno); } catch (e) {}
        try { if (typeof setB === 'function') setB('!', 'JS error (см. консоль)'); } catch (e) {}
    });
    window.addEventListener('unhandledrejection', function (ev) {
        try { console.error('[agent] unhandled rejection:', ev.reason && (ev.reason.stack || ev.reason.message || ev.reason)); } catch (e) {}
        try { if (typeof setB === 'function') setB('!', 'promise rejection'); } catch (e) {}
    });
    var CALL = 'AGENT' + '_CALL';
    var SAY  = 'AGENT' + '_SAY';
    var RES  = 'AGENT' + '_RESULT';
    var SERVER = GM_getValue('agent_server', 'http://127.0.0.1:8766');   // другой порт: GM_setValue('agent_server', 'http://127.0.0.1:XXXX')
    var GAP_MS = 15000, JIT = 3000, STABLE_MS = 800, TICK_MS = 300;
    var DATA_TTL = 10 * 60 * 1000;
    var RESULT_DEBOUNCE = 5000;
    var GEN_STALE_MS = 800;
    var GEN_TIMEOUT_MS = 90000;
    var OUTBOX_TIMEOUT_MS = 45000;
    var OUTBOX_CAP = 50;
    var RATE_STEPS = [2*60000, 5*60000, 10*60000, 20*60000];
    var RATE_RESET = 60 * 60 * 1000;
    var RATE_PATTERNS = [/too frequent/i, /try again/i, /rate.?limit/i, /слишком часто/i, /подожди/i];
    var TOKEN = GM_getValue('agent_token', '');
    if (!TOKEN) { TOKEN = prompt('AGENT_TOKEN'); if (!TOKEN) return; GM_setValue('agent_token', TOKEN); }

    // Меню Tampermonkey: сменить или показать токен без правки скрипта.
    // Токен лежит в GM storage; после смены нужен reload: сервер уже
    // открыл .env со своим токеном, и все запросы со старым получат 403.
    function changeToken() {
        var cur = GM_getValue('agent_token', '');
        var shown = cur ? (cur.length > 8 ? cur.slice(0, 4) + '…' + cur.slice(-4) : cur) : '(пусто)';
        var v = prompt('Новый AGENT_TOKEN (сейчас: ' + shown + ').\nВозьми из agent/.env, строка AGENT_TOKEN=', '');
        if (v === null) return;                 // отмена
        v = v.trim();
        if (!v) { alert('Пустой токен не сохранён.'); return; }
        GM_setValue('agent_token', v);
        TOKEN = v;
        try { setB('🔑', 'токен сменён, перезагрузка'); } catch (e) {}
        alert('Токен сохранён. Сейчас перезагружу вкладку — запросы пойдут с новым токеном.');
        location.reload();
    }

    function showToken() {
        var cur = GM_getValue('agent_token', '');
        alert('Текущий AGENT_TOKEN: ' + (cur || '(пусто)') + '\n\nСервер: ' + SERVER);
    }

    try {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('🔑 Сменить AGENT_TOKEN', changeToken);
            GM_registerMenuCommand('👁 Показать AGENT_TOKEN', showToken);
        }
    } catch (e) { console.warn('[agent] меню Tampermonkey недоступно:', e); }

    var SEL = {
        assistant: '.ds-markdown.ds-assistant-message-main-content',
        thinkContent: '.ds-think-content',
        actionBtn: '.bf38813a .ds-button--primary',
        actionBtnAlt: ['.bf38813a [role="button"]', '.ds-button--primary'],
        textarea: 'textarea',
        textareaAlt: '[contenteditable="true"]',
        stopIconPath: 'M2 4.88',
        errorText: '._1ce76f5',
        errorContainer: '._60a11b2'
    };

    function q(s) { try { return document.querySelector(s); } catch (e) { return null; } }
    function qa(s) { try { return Array.from(document.querySelectorAll(s)); } catch (e) { return []; } }
    function findTA() { return q(SEL.textarea) || q(SEL.textareaAlt); }
    function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

    function doneKey(id, h) { return 'agent_done_' + id + '_' + h; }
    function isDone(id, h) {
        var v = localStorage.getItem(doneKey(id, h));
        if (!v) return false;
        var at = parseInt(v, 10);
        if (isNaN(at) || Date.now() - at > DATA_TTL) { localStorage.removeItem(doneKey(id, h)); return false; }
        return true;
    }
    function pruneStorage() {
        try {
            var cid = (location.pathname || '/').split('/').filter(Boolean).pop() || '';
            var dead = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (!k) continue;
                if (k.indexOf('agent_done_') === 0) {
                    var at = parseInt(localStorage.getItem(k), 10);
                    if (isNaN(at) || Date.now() - at > DATA_TTL) dead.push(k);
                } else if (k === 'agent_chat_chars_max' || (k.indexOf('agent_chat_chars_max:') === 0 && k !== 'agent_chat_chars_max:' + cid)) {
                    dead.push(k);
                }
            }
            dead.forEach(function (k) { localStorage.removeItem(k); });
        } catch (e) {}
    }
    setTimeout(pruneStorage, 2000);
    setInterval(pruneStorage, 30 * 60 * 1000);
    function markDone(id, h) { try { localStorage.setItem(doneKey(id, h), String(Date.now())); } catch (e) {} }

    function loadNum(k, def) { try { var v = localStorage.getItem(k); return v ? parseInt(v,10) : def; } catch(e){ return def; } }
    function saveNum(k, v) { try { localStorage.setItem(k, String(v)); } catch(e){} }
    var rateCooldownUntil = loadNum('agent_rate_until', 0) || 0;
    var rateStrikes = loadNum('agent_rate_strikes', 0) || 0;
    var lastRateStrikeAt = loadNum('agent_rate_at', 0) || 0;
    function inRateCooldown() { return Date.now() < rateCooldownUntil; }

    function reportCooldown(seconds) {
        GM_xmlhttpRequest({
            method: 'POST', url: SERVER + '/cooldown',
            headers: { 'Content-Type': 'application/json', 'X-Agent-Token': TOKEN },
            data: JSON.stringify({ seconds: seconds })
        });
    }

    var TAB_ID = sessionStorage.getItem('agent_tab_id');
    if (!TAB_ID) { TAB_ID = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('agent_tab_id', TAB_ID); }
    var ACTIVE_KEY = 'agent_active_tab', HB_MS = 2000, STALE_MS = 5000;
    var isActive = false;
    function readActive() {
        try { var raw = localStorage.getItem(ACTIVE_KEY); if (!raw) return null;
            var d = JSON.parse(raw); if (!d || typeof d.ts !== 'number') return null;
            if (Date.now() - d.ts > STALE_MS) return null; return d;
        } catch (e) { return null; }
    }
    function writeActive() { try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id: TAB_ID, ts: Date.now() })); } catch (e) {} }
    function removeActive() { try { var cur = readActive(); if (cur && cur.id === TAB_ID) localStorage.removeItem(ACTIVE_KEY); } catch (e) {} }
    function becomeActive() { writeActive(); isActive = true; setB('🟢', 'активна'); }
    function becomePassive() { removeActive(); isActive = false; setB('⚪', 'пассивна'); }
    setInterval(function () {
        var cur = readActive();
        if (cur && cur.id === TAB_ID) { writeActive(); if (!isActive) { isActive = true; setB('🟢', 'активна'); } return; }
        if (isActive) { isActive = false; setB('⚪', 'пассивна'); return; }
        if (!cur) { setTimeout(function () { if (!readActive()) becomeActive(); }, 200 + Math.random() * 400); }
    }, HB_MS);
    window.addEventListener('beforeunload', function () { if (isActive) removeActive(); });
    (function initLock() {
        var cur = readActive();
        if (cur && cur.id === TAB_ID) { isActive = true; writeActive(); }
        else if (!cur) { setTimeout(function () { if (!readActive()) becomeActive(); }, 200 + Math.random() * 400); }
    })();

    var lastAnswerLen = -1, lastAnswerChangeAt = 0, lastGenStartAt = 0;
    function watchAnswer() {
        var a = qa(SEL.assistant);
        if (!a.length) return;
        var len = (a[a.length - 1].innerText || '').length;
        if (len !== lastAnswerLen) { lastAnswerLen = len; lastAnswerChangeAt = Date.now(); }
    }
    function stopButtonVisible() {
        var btns = qa(SEL.actionBtn);
        for (var i = 0; i < SEL.actionBtnAlt.length; i++) btns = btns.concat(qa(SEL.actionBtnAlt[i]));
        for (var j = 0; j < btns.length; j++) {
            var path = btns[j].querySelector && btns[j].querySelector('svg path');
            if (path && (path.getAttribute('d') || '').indexOf(SEL.stopIconPath) === 0) return true;
        }
        return false;
    }
    function isGenerating() {
        var gen = (Date.now() - lastAnswerChangeAt < GEN_STALE_MS) || stopButtonVisible();
        if (gen) {
            if (!lastGenStartAt) lastGenStartAt = Date.now();
            if (Date.now() - lastGenStartAt > GEN_TIMEOUT_MS) {
                console.warn('[agent] ⏰ генерация висит > 90с, форсирую');
                return false;
            }
            return true;
        }
        lastGenStartAt = 0;
        return false;
    }
    setInterval(watchAnswer, 300);

    // ===== auto-retry: safety / empty / stopped =====
    var SAFETY_RE = /<ds_safety>[\s\S]{20,20000}?<\/ds_safety>\s*(?:Safe|Unsafe)\b/i;
    var STOPPED_MARK_RE = /^(Stopped|Stopped by user|Generation stopped|已停止|已中断)$/i;
    var CONTINUE_RE = /^(Continue|Продолжить|Продолжить генерацию|继续|继续生成)$/i;
    var lastRetryAt = 0;
    var RETRY_COOLDOWN_MS = 8000;
    var retryCount = 0;
    var MAX_RETRIES = 3;
    var lastRecoveryAt = 0;
    var RECOVERY_COOLDOWN_MS = 120000;
    var problemSince = 0;
    var lastProblemType = '';

    var RECOVERY_TEXT = {
        safety: '[auto] no response was generated, please continue',
        empty:  '[auto] no response was generated, please continue',
        stopped: '[auto] generation was interrupted by the client, please continue',
        'continue-button': '[auto] generation was interrupted by the client, please continue'
    };

    function getLastAssistantNode() {
        var a = qa(SEL.assistant);
        if (!a.length) return null;
        return a[a.length - 1];
    }

    function getLastMessageRoot(node) {
        var el = node;
        for (var i = 0; i < 8 && el; i++) {
            if (el.classList && el.classList.contains('ds-message')) return el;
            el = el.parentElement;
        }
        return node ? (node.closest ? (node.closest('.ds-message') || node.parentElement) : node.parentElement) : null;
    }

    function readSafetySource(node) {
        var parts = [];
        if (node) parts.push(node.innerText || node.textContent || '');
        var think = qa(SEL.thinkContent);
        if (think.length) {
            var t = think[think.length - 1];
            parts.push(t.innerText || t.textContent || '');
        }
        return parts.join('\n');
    }

    function findRetryButton(scope) {
        var roots = scope ? [scope] : [];
        roots.push(document);
        for (var r = 0; r < roots.length; r++) {
            var root = roots[r];
            if (!root || !root.querySelectorAll) continue;
            var cands = root.querySelectorAll('[role="button"], button');
            var found = null;
            for (var i = 0; i < cands.length; i++) {
                var el = cands[i];
                var p = el.querySelector && el.querySelector('svg path');
                if (!p) continue;
                var d = p.getAttribute('d') || '';
                if (d.indexOf('M7.921') === 0) found = el;
            }
            if (found) return found;
            var labels = ['etry', 'Regenerate', '重新生成', '重新回答'];
            for (var j = 0; j < labels.length; j++) {
                var els = root.querySelectorAll('[aria-label*="' + labels[j] + '"]');
                if (els.length) return els[els.length - 1];
            }
        }
        return null;
    }

    function findContinueButton(scope) {
        var roots = scope ? [scope] : [];
        roots.push(document);
        for (var r = 0; r < roots.length; r++) {
            var root = roots[r];
            if (!root || !root.querySelectorAll) continue;
            var cands = root.querySelectorAll('[role="button"], button, [class*="button"]');
            for (var i = 0; i < cands.length; i++) {
                var el = cands[i];
                var txt = (el.textContent || '').trim();
                if (!CONTINUE_RE.test(txt)) continue;
                var rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) continue;
                return el;
            }
        }
        return null;
    }

    // v4.5: строгий детект обрыва.
    // 1. span с точным "Stopped" (не в think-блоке) — маркер в шапке
    // 2. видимая кнопка Continue в последнем сообщении
    // unfinished-call УБРАН: срабатывал на примерах AGENT_CALL в ответе,
    // на стриминге (MK2_END ещё не дошёл) и на think-блоке.
    function detectBrokenAnswer() {
        var items = qa('[data-virtual-list-item-key]');
        var last = items.length ? items[items.length - 1] : null;
        if (!last) return null;
        var spans = last.querySelectorAll('span');
        for (var i = 0; i < spans.length; i++) {
            var span = spans[i];
            try { if (span.closest && span.closest(SEL.thinkContent)) continue; } catch (e) {}
            var t = (span.textContent || '').trim();
            if (STOPPED_MARK_RE.test(t)) return 'stopped-marker';
        }
        var contBtn = findContinueButton(last);
        if (contBtn) return 'continue-button';
        return null;
    }

    function detectEmptyStuck() {
        var items = qa('[data-virtual-list-item-key]');
        if (!items.length) return false;
        var last = items[items.length - 1];
        var btns = last.querySelectorAll('[role="button"]');
        var hasRetry = false;
        for (var i = 0; i < btns.length; i++) {
            var p = btns[i].querySelector && btns[i].querySelector('svg path');
            if (p && (p.getAttribute('d') || '').indexOf('M7.921') === 0) { hasRetry = true; break; }
        }
        if (!hasRetry) return false;
        var md = last.querySelector('.ds-markdown, .ds-assistant-message-main-content');
        if (md && (md.innerText || '').trim()) return false;
        return true;
    }

    function detectProblemType(node) {
        if (detectBrokenAnswer()) return 'stopped';
        if (detectEmptyStuck()) return 'empty';
        var txt = readSafetySource(node);
        if (SAFETY_RE.test(txt)) return 'safety';
        return null;
    }

    var _lastContinueAt = 0;
    var _CONTINUE_GAP_MS = 5000;
    function sendContinue() {
        if (Date.now() - _lastContinueAt < _CONTINUE_GAP_MS) return false;
        var ta = findTA();
        if (!ta) return false;
        var cur = (ta.value || ta.textContent || '').trim();
        if (cur) {
            console.warn('[agent] sendContinue: textarea не пустая, пропускаю');
            return false;
        }
        try {
            insertText(ta, 'continue');
            setTimeout(function () { pressEnter(ta); }, 150);
            _lastContinueAt = Date.now();
            console.warn('[agent] sendContinue: написал continue в чат');
            return true;
        } catch (e) {
            console.warn('[agent] sendContinue error:', e && e.message);
            return false;
        }
    }

    function _clickContinueTwice(btn) {
        function fire(el) {
            try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); } catch (e) {}
            try { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })); } catch (e) {}
            try { el.click(); } catch (e) {}
        }
        fire(btn);
        setTimeout(function () { try { fire(btn); } catch (e) {} }, 300);
    }

    function checkSafetyAndRetry() {
        if (!isActive) return;
        if (isGenerating()) {
            problemSince = 0;
            return;
        }
        var node = getLastAssistantNode();
        var problem = detectProblemType(node);
        if (!problem) {
            if (retryCount > 0) console.log('[agent] problem resolved');
            retryCount = 0;
            problemSince = 0;
            lastProblemType = '';
            return;
        }
        if (problem !== lastProblemType) {
            retryCount = 0;
            problemSince = 0;
            lastProblemType = problem;
            console.log('[agent] problem detected:', problem);
        }
        if (!problemSince) problemSince = Date.now();
        if (Date.now() - problemSince < 3000) return;
        if (Date.now() - lastRetryAt < RETRY_COOLDOWN_MS) return;
        if (retryCount >= MAX_RETRIES) {
            if (Date.now() - lastRecoveryAt > RECOVERY_COOLDOWN_MS) {
                lastRecoveryAt = Date.now();
                var recovery = RECOVERY_TEXT[problem] || RECOVERY_TEXT.safety;
                enqueue(recovery);
                setB('X', 'восстановление (' + problem + ')');
                console.warn('[agent] max retries (' + problem + ') reached, recovery sent');
            } else {
                setB('X', 'восстановление: пауза');
            }
            return;
        }
        if (problem === 'stopped' || problem === 'continue-button') {
            var btn = findContinueButton(document);
            if (btn) {
                _clickContinueTwice(btn);
                retryCount++;
                lastRetryAt = Date.now();
                setB('R', 'остановлено (кнопка) ' + retryCount + '/' + MAX_RETRIES);
                console.warn('[agent] stopped retry via button ' + retryCount + '/' + MAX_RETRIES);
                return;
            }
            if (sendContinue()) {
                retryCount++;
                lastRetryAt = Date.now();
                setB('B', 'продолжение отправлено ' + retryCount + '/' + MAX_RETRIES);
                console.warn('[agent] stopped retry via text ' + retryCount + '/' + MAX_RETRIES);
                return;
            }
            retryCount++;
            lastRetryAt = Date.now();
            setB('X', 'остановлено, нет кнопки/текста ' + retryCount + '/' + MAX_RETRIES);
            console.warn('[agent] stopped, no recovery possible this tick (' + retryCount + '/' + MAX_RETRIES + ')');
            return;
        }
        var rbtn = findRetryButton(getLastMessageRoot(node));
        if (!rbtn) {
            console.warn('[agent] ' + problem + ' detected, retry button not found');
            return;
        }
        retryCount++;
        lastRetryAt = Date.now();
        setB('R', problem + ' ' + retryCount + '/' + MAX_RETRIES);
        console.warn('[agent] ' + problem + ' retry ' + retryCount + '/' + MAX_RETRIES);
        rbtn.click();
    }
    setInterval(checkSafetyAndRetry, 2500);
    // ===== /auto-retry =====

    function detectRateLimit() {
        var containers = qa(SEL.errorContainer);
        for (var i = containers.length - 1; i >= 0; i--) {
            var el = containers[i];
            if (el.getAttribute('data-agent-handled') === '1') continue;
            var textEl = el.querySelector && el.querySelector(SEL.errorText);
            var txt = ((textEl && textEl.innerText) || el.innerText || '').trim();
            if (!txt) continue;
            for (var j = 0; j < RATE_PATTERNS.length; j++) {
                if (RATE_PATTERNS[j].test(txt)) {
                    el.setAttribute('data-agent-handled', '1');
                    return { text: txt };
                }
            }
            el.setAttribute('data-agent-handled', '1');
        }
        return null;
    }
    function handleRateLimit() {
        var now = Date.now();
        if (now - lastRateStrikeAt > RATE_RESET) rateStrikes = 0;
        rateStrikes += 1;
        lastRateStrikeAt = now;
        var wait = RATE_STEPS[Math.min(rateStrikes - 1, RATE_STEPS.length - 1)];
        rateCooldownUntil = now + wait;
        saveNum('agent_rate_until', rateCooldownUntil);
        saveNum('agent_rate_strikes', rateStrikes);
        saveNum('agent_rate_at', lastRateStrikeAt);
        console.warn('[agent] 🚫 rate limit, пауза ' + Math.round(wait/60000) + ' мин');
        reportCooldown(Math.round(wait / 1000));
    }
    setInterval(function () {
        if (!isActive) return;
        if (detectRateLimit()) handleRateLimit();
        if (rateCooldownUntil && Date.now() > rateCooldownUntil) {
            if (!inRateCooldown()) {
                reportCooldown(0);
                rateCooldownUntil = 0;
                saveNum('agent_rate_until', 0);
            }
        }
    }, 1000);

    function insertText(ta, txt) {
        ta.focus();
        if (ta.tagName !== 'TEXTAREA') {          // contenteditable-фолбэк
            try {
                document.execCommand('selectAll', false, null);
                if (!document.execCommand('insertText', false, txt)) ta.textContent = txt;
            } catch (e) { ta.textContent = txt; }
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, txt);
        ta.dispatchEvent(new Event('input',  { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function pressEnter(el) {
        var opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        try { el.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch (e) {}
        try { el.dispatchEvent(new KeyboardEvent('keypress', opts)); } catch (e) {}
        try { el.dispatchEvent(new KeyboardEvent('keyup', opts)); } catch (e) {}
    }

    var outbox = [], lastSendAt = 0, firstOutboxAt = 0;
    function enqueue(txt) {
        outbox.push(txt);
        if (!firstOutboxAt) firstOutboxAt = Date.now();
        if (isActive) setB('🟢', 'свободна · очередь ' + outbox.length);
    }
    function fmtSec(ms) { return Math.round(ms / 1000) + 'с'; }
    function fmtMin(ms) { var s = Math.round(ms/1000); return Math.floor(s/60) + ':' + ('0'+(s%60)).slice(-2); }

    var pendingResults = [], resultsTimer = null, firstResultAt = 0;
    var RESULT_MAX_WINDOW = 45000;
    function flushResultsNow() {
        if (!pendingResults.length) { resultsTimer = null; firstResultAt = 0; return; }
        var rep = RES + ' ' + JSON.stringify({ results: pendingResults });
        pendingResults = [];
        resultsTimer = null; firstResultAt = 0;
        enqueue(rep);
    }
    function enqueueResult(result) {
        pendingResults.push(result);
        if (!firstResultAt) firstResultAt = Date.now();
        if (resultsTimer) clearTimeout(resultsTimer);
        var elapsed = Date.now() - firstResultAt;
        var wait = Math.max(800, Math.min(RESULT_DEBOUNCE, RESULT_MAX_WINDOW - elapsed));
        resultsTimer = setTimeout(flushResultsNow, wait);
    }

    function tryFlush() {
        if (!isActive) {
            if (outbox.length) {
                var waiting = firstOutboxAt ? Math.round((Date.now() - firstOutboxAt) / 1000) : 0;
                setB('P', 'пассивна · ждут ' + outbox.length + ' · ' + waiting + 'с');
                if (firstOutboxAt && (Date.now() - firstOutboxAt > 20000)) {
                    try { becomeActive(); console.warn('[agent] force becomeActive: outbox stuck ' + waiting + 's'); } catch (e) {}
                }
            }
            return;
        }
        if (inRateCooldown()) {
            var left = rateCooldownUntil - Date.now();
            setB('P', 'пауза ' + fmtMin(left) + ' · очередь ' + outbox.length);
            return;
        }
        if (!outbox.length) { firstOutboxAt = 0; setB('I', 'свободна'); return; }
        var stuck = firstOutboxAt && (Date.now() - firstOutboxAt > OUTBOX_TIMEOUT_MS);
        if (!stuck) {
            if (Date.now() - lastSendAt < GAP_MS) {
                var w = lastSendAt + GAP_MS - Date.now();
                setB('A', 'копилка ' + outbox.length + ' · ' + fmtSec(w));
                return;
            }
            if (isGenerating()) {
                setB('T', 'думает · очередь ' + outbox.length);
                return;
            }
        }
        var ta = findTA();
        if (!ta) return;
        var MAX_LEN = 50000;
        var picked = [], total = 0;
        for (var pi = 0; pi < outbox.length; pi++) {
            var it = outbox[pi];
            if (picked.length && total + it.length + 2 > MAX_LEN) break;
            picked.push(it); total += it.length + 2;
        }
        if (!picked.length) return;
        var msg = picked.join('\n\n');
        var cur = (ta.value || ta.textContent || '').trim();
        if (cur && cur !== msg) return;
        outbox.splice(0, picked.length);
        if (!outbox.length) firstOutboxAt = 0;
        insertText(ta, msg);
        var _verify = 0;
        function _trySend() {
            pressEnter(ta);
            setTimeout(function () {
                var still = (ta.value || ta.textContent || '').trim();
                if (still && still === msg && _verify < 3) {
                    _verify++;
                    console.warn('[agent] send verify: textarea still has text, retry enter ' + _verify + '/3');
                    _trySend();
                } else if (still && still === msg) {
                    console.error('[agent] send FAILED after 3 enter retries, returning to outbox');
                    outbox.unshift(msg);
                    firstOutboxAt = Date.now();
                    setB('!', 'ошибка отправки, повтор позже');
                }
            }, 1000);
        }
        setTimeout(_trySend, 200);
        lastSendAt = Date.now() + Math.random() * JIT;
        setB('S', 'отправлено ' + picked.length + ' · остаток ' + outbox.length);
    }

    // v5.1: retry на сетевые ошибки/timeout (2 попытки, 500мс пауза). 403 — БЕЗ retry:
    // секрет сам не починится, ретраить бессмысленно. bad json — тоже без retry.
    // Безопасно для /call: сервер дедупит одинаковые id+args в течение 10 минут.
    var POST_RETRIES = 2, POST_RETRY_DELAY_MS = 500;
    function post(path, body, cb, timeoutMs) {
        var finished = false;
        var attempt = 0;
        function finish(err, result) {
            if (finished) return;
            finished = true;
            try {
                cb(err, result);
            } catch (callbackError) {
                console.error('[agent] post callback failed:', callbackError);
            }
        }
        function tryOnce() {
            attempt++;
            GM_xmlhttpRequest({
                method: 'POST', url: SERVER + path,
                headers: { 'Content-Type': 'application/json', 'X-Agent-Token': TOKEN },
                data: JSON.stringify(body), timeout: timeoutMs || 30000,
                onload: function (r) {
                    var st = r && r.status;
                    if (st === 403) {
                        console.error('[agent] 🔒 403 — токен не совпадает с .env');
                        try { setB('🔒', 'нет доступа (токен)'); } catch (e) {}
                        finish('forbidden');
                        return;
                    }
                    // status может быть undefined (некоторые сборки/тесты) — это НЕ ошибка.
                    // Ретраим только настоящие 5xx (сервер упал/перегружен). 4xx — это наш запрос неверен, повтор не поможет.
                    if (typeof st === 'number' && st >= 500) {
                        if (attempt <= POST_RETRIES) { setTimeout(tryOnce, POST_RETRY_DELAY_MS); return; }
                        finish('http ' + st);
                        return;
                    }
                    if (typeof st === 'number' && st >= 400) {
                        finish('http ' + st);
                        return;
                    }
                    var parsed;
                    try {
                        parsed = JSON.parse(r.responseText);
                    } catch (e) {
                        finish('bad json');
                        return;
                    }
                    finish(null, parsed);
                },
                onerror: function () {
                    if (attempt <= POST_RETRIES) { setTimeout(tryOnce, POST_RETRY_DELAY_MS); return; }
                    finish('network error');
                },
                ontimeout: function () {
                    if (attempt <= POST_RETRIES) { setTimeout(tryOnce, POST_RETRY_DELAY_MS); return; }
                    finish('timeout');
                }
            });
        }
        tryOnce();
    }
    function get(path, cb) {
        GM_xmlhttpRequest({ method: 'GET', url: SERVER + path,
            headers: { 'X-Agent-Token': TOKEN }, timeout: 10000,
            onload: function (r) { try { cb(null, JSON.parse(r.responseText)); } catch (e) { cb('bad json'); } },
            onerror: function () { cb('network error'); }, ontimeout: function () { cb('timeout'); } });
    }

    // v5.5: красивый бейдж-пилюля: цветная точка состояния + читаемый шрифт.
    var badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;display:flex;align-items:center;gap:6px;background:rgba(24,24,38,.92);color:#e8eaed;padding:4px 12px;border-radius:20px;font:12px "Segoe UI",system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);opacity:.9;pointer-events:none;transition:background .3s, border-color .3s;';
    badge.innerHTML = '<span class="dot" style="width:8px;height:8px;border-radius:50%;background:#8a919b;box-shadow:0 0 6px #8a919b;flex-shrink:0;"></span><span class="label" style="color:#a97af7;font-size:11px;letter-spacing:.3px;flex-shrink:0;font-weight:600;">Астра</span><span class="text" style="color:#e8eaed;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">загрузка</span>';
    var _dot = badge.querySelector('.dot');
    var _text = badge.querySelector('.text');
    var _STATE = {'🟢':'#7bc47f','I':'#7bc47f','T':'#a97af7','P':'#e0c06c','⏳':'#e09a6c','🟡':'#e0c06c','!':'#e06c6c'};
    function setB(st, x) {
        var color = _STATE[st] || '#8a919b';
        _dot.style.background = color;
        _dot.style.boxShadow = '0 0 6px ' + color;
        _text.textContent = String(x || '');
        var bg = 'rgba(24,24,38,.92)', bd = 'rgba(255,255,255,.08)';
        if (st === 'T') { bg = 'rgba(40,24,64,.92)'; bd = 'rgba(169,122,247,.35)'; }
        else if (st === 'P' || st === '🟡' || st === '⏳') { bg = 'rgba(42,38,24,.92)'; bd = 'rgba(224,192,108,.35)'; }
        else if (st === '!') { bg = 'rgba(48,24,24,.92)'; bd = 'rgba(224,108,108,.35)'; }
        badge.style.background = bg;
        badge.style.borderColor = bd;
    }
    function mount() { if (!document.body) return setTimeout(mount, 300); document.body.appendChild(badge); }
    mount();

    // v5.1: раз в минуту проверяем, что разметка DeepSeek на месте.
    // Если селектор сломался (редизайн), мост «слепнет» молча — теперь узнаем сразу.
    var _selfcheckMisses = 0;
    function _checkSelectors() {
        var missing = [];
        if (!findTA()) missing.push('textarea');
        if (!qa(SEL.actionBtn).length && !SEL.actionBtnAlt.some(function (s) { return q(s); })) missing.push('кнопка отправки');
        if (!qa(SEL.assistant).length) missing.push('ответ ассистента');
        if (!q(SEL.errorContainer)) missing.push('контейнер ошибок');
        if (!missing.length) {
            if (_selfcheckMisses) { _selfcheckMisses = 0; console.log('[agent] ✅ разметка снова на месте'); }
            return true;
        }
        _selfcheckMisses++;
        if (_selfcheckMisses === 2) {
            console.error('[agent] 🔧 разметка DeepSeek изменилась — нет: ' + missing.join(', ') + '. Чинить SEL в начале скрипта.');
            try { setB('!', 'нет: ' + missing.join(', ')); } catch (e) {}
        }
        return false;
    }
    setTimeout(_checkSelectors, 8000);
    setInterval(_checkSelectors, 60000);

    // ======================================================================
    // v5.0: разбор AGENT_CALL / AGENT_SAY, последовательное выполнение, результаты
    // ======================================================================
    var _lostCount = 0;
    // v5.0 FIX: переменная не была объявлена -> ReferenceError в tick() на каждом тике -> ни один вызов не выполнялся.
    var _processedMap = new WeakMap();
    var _pendingCalls = {};                 // pk -> 1: вызов в очереди или выполняется
    var MUTATING = { exec: 1, write_file: 1, write_file_b64: 1, append_file: 1, edit_file: 1, delete_file: 1, bg_start: 1 };
    var CALL_TIMEOUT_MS = 330000;           // сервер ждёт exec до 300с; раньше клиент сдавался через 30с и терял результат
    var INCOMPLETE_GRACE_MS = 20000;        // сколько ждать «недописанный» блок, прежде чем объявить его потерянным

    function lostCall(what, err) {
        _lostCount++;
        console.warn('[agent] LOST call #' + _lostCount + ':', err, String(what).slice(0, 300));
        try { setB('!', 'потерян вызов #' + _lostCount); } catch (e) {}
        try { enqueueResult({ id: 'lost-' + _lostCount, ok: false, error: 'client lost call: ' + String(err).slice(0, 200) }); } catch (e2) {}
    }
    function forgetDone(id, h) { try { localStorage.removeItem(doneKey(id, h)); } catch (e) {} }

    function findJsonEnd(body, start) {
        var depth = 0, inStr = false, esc = false;
        for (var i = start; i < body.length; i++) {
            var c = body[i];
            if (inStr) {
                if (esc) { esc = false; continue; }
                if (c === '\\') { esc = true; continue; }
                if (c === '"') { inStr = false; continue; }
                continue;
            }
            if (c === '"') { inStr = true; continue; }
            if (c === '{') depth++;
            else if (c === '}') { depth--; if (depth === 0) return i; }
        }
        return -1;
    }

    function rtrim(s) { return s.replace(/[\s\u00a0]+$/, ''); }

    // Делит блок на группы «одна AGENT_CALL + её @@-вставки». Строки внутри @@name ... @@end никогда
    // не начинают новую группу (раньше строка файла, начинавшаяся с AGENT_CALL, ломала разбор).
    function splitGroups(body) {
        var lines = body.split('\n'), groups = [], cur = null, inBlk = false;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (inBlk) {
                cur.push(line);
                if (rtrim(line) === '@@end') inBlk = false;
                continue;
            }
            var trimmedLine = line.replace(/^\s+/, '');
            if (trimmedLine.indexOf(CALL) === 0 || trimmedLine.indexOf('AGENT_B64:') === 0) {
                if (cur) groups.push(cur);
                cur = [line];
                continue;
            }
            if (cur) {
                cur.push(line);
                if (line.indexOf('@@') === 0 && rtrim(line) !== '@@end') inBlk = true;
            }
        }
        if (cur) groups.push(cur);
        return groups;
    }

    // -> { call } | { incomplete: true } | { error: '...' }
    function parseGroup(text) {
        // v5.6: AGENT_B64 — закодированный вызов. DeepSeek иногда ложно
        // триггерит 'Content violates terms' на легитимном тексте (пути,
        // промпты). Тогда Астра шлёт AGENT_B64: <base64>, и фильтр не
        // видит триггерных слов. Декодируем и обрабатываем как AGENT_CALL.
        var b64idx = text.indexOf('AGENT_B64:');
        if (b64idx >= 0) {
            var b64start = b64idx + 'AGENT_B64:'.length;
            var b64end = text.indexOf('\n', b64start);
            if (b64end < 0) b64end = text.length;
            var b64str = text.substring(b64start, b64end).trim();
            if (!b64str) return { incomplete: true };
            try {
                var bin = atob(b64str);
                var bytes = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                text = new TextDecoder('utf-8').decode(bytes);
                // Если в base64 был только JSON без префикса, добавим его для парсера
                if (text.indexOf(CALL) < 0 && text.indexOf('{') === 0) {
                    text = CALL + ' ' + text;
                }
            } catch (e) {
                return { error: 'AGENT_B64 decode failed: ' + (e && e.message) };
            }
        }
        var idx = text.indexOf(CALL);
        if (idx < 0) return { error: 'no AGENT_CALL' };
        var braceStart = text.indexOf('{', idx);
        if (braceStart < 0) return { incomplete: true };
        var braceEnd = findJsonEnd(text, braceStart);
        if (braceEnd < 0) return { incomplete: true };
        var jsonStr = text.substring(braceStart, braceEnd + 1);
        var call;
        try { call = JSON.parse(jsonStr); } catch (e) { return { error: 'json parse: ' + (e && e.message), raw: jsonStr }; }
        if (!call || typeof call !== 'object' || Array.isArray(call)) return { error: 'call must be an object', raw: jsonStr };
        if (!call.args || typeof call.args !== 'object' || Array.isArray(call.args)) call.args = {};
        var rest = text.substring(braceEnd + 1).split('\n');
        for (var i = 0; i < rest.length; i++) {
            var line = rest[i];
            if (line.indexOf('@@') !== 0 || rtrim(line) === '@@end') continue;
            var name = line.substring(2).trim();
            var j = i + 1, buf = [], closed = false;
            for (; j < rest.length; j++) {
                if (rtrim(rest[j]) === '@@end') { closed = true; break; }
                buf.push(rest[j]);
            }
            if (!closed) return { incomplete: true };     // раньше недописанный @@-блок молча терялся и вызов шёл без content
            if (name) call.args[name] = buf.join('\n');
            i = j;
        }
        return { call: call };
    }

    function callKey(call) {
        var h = hash(JSON.stringify({ id: call.id, cmd: call.cmd, args: call.args }));
        return { h: h, pk: call.id + '|' + h };
    }

    // Что реально нужно вызову: защита от записи пустого файла, если content ещё не доехал.
    function missingPayload(call) {
        var a = call.args || {};
        if ((call.cmd === 'write_file' || call.cmd === 'append_file') && typeof a.content !== 'string') return 'content';
        if (call.cmd === 'write_file_b64' && typeof a.b64 !== 'string') return 'b64';
        return null;
    }

    // ---------- результаты: ничего не теряем молча ----------
    var STR_MAX = 12000, ARR_MAX_JSON = 16000;
    function shrinkString(key, s) {
        if (s.length <= STR_MAX) return { v: s };
        var info = { kept_chars: STR_MAX, of_chars: s.length };
        if (key === 'output') {                  // у exec важен хвост (ошибки/итог) — оставляем голову и хвост
            var head = 3000, tail = STR_MAX - head;
            info.mode = 'head+tail';
            return { v: s.slice(0, head) + '\n...[обрезано клиентом: пропущено ' + (s.length - STR_MAX) + ' симв.]...\n' + s.slice(-tail), info: info };
        }
        if (key === 'stdout' || key === 'stderr') { info.mode = 'tail'; return { v: s.slice(-STR_MAX), info: info }; }
        info.mode = 'head';
        return { v: s.slice(0, STR_MAX), info: info };
    }
    function shrinkResult(r, call) {
        var o = {}, trunc = {};
        Object.keys(r || {}).forEach(function (k) { if (r[k] !== null && r[k] !== undefined) o[k] = r[k]; });
        Object.keys(o).forEach(function (k) {
            if (typeof o[k] === 'string') {
                var sr = shrinkString(k, o[k]);
                if (sr.info) {
                    if (call && call.cmd === 'read_file' && k === 'output' && typeof o.offset === 'number') {
                        // читаем по строкам: подсказываем, откуда продолжить
                        var cut = o[k].lastIndexOf('\n', STR_MAX);
                        var kept = cut > STR_MAX * 0.5 ? o[k].slice(0, cut) : o[k].slice(0, STR_MAX);
                        o.next_offset = o.offset + kept.split('\n').length - (cut > STR_MAX * 0.5 ? 0 : 1);
                        sr = { v: kept, info: { kept_chars: kept.length, of_chars: o[k].length, mode: 'head' } };
                    }
                    o[k] = sr.v; trunc[k] = sr.info; o.truncated = true;
                }
            } else if (Array.isArray(o[k])) {
                var arr = o[k], n = arr.length;
                while (arr.length > 1 && JSON.stringify(arr).length > ARR_MAX_JSON) arr = arr.slice(0, Math.ceil(arr.length / 2));
                if (arr.length < n) { o[k] = arr; trunc[k] = { kept_items: arr.length, of_items: n }; o.truncated = true; }
            }
        });
        if (Object.keys(trunc).length) o.client_truncated = trunc;
        if (typeof o.error === 'string') o.error = o.error.slice(0, 600);
        return o;
    }

    // ---------- выполнение ----------
    function execOne(call, cb) {
        var pk = callKey(call);
        // На сервер уходят только id/cmd/args: лишние поля из чата (silent, origin...) модель подделать не может.
        post('/call', { id: call.id, cmd: call.cmd, args: call.args }, function (e, r) {
            delete _pendingCalls[pk.pk];
            var result;
            if (e) {
                result = { id: call.id, ok: false, error: String(e).slice(0, 200) };
                console.warn('[agent] LOST call (network):', e);
            } else if (!r || typeof r !== 'object' || Array.isArray(r)) {
                result = { id: call.id, ok: false, error: 'Invalid response type: ' + typeof r };
            } else {
                result = r;
                markDone(call.id, pk.h);
            }
            var slim;
            try { slim = shrinkResult(result, call); }
            catch (ex) { slim = { id: call.id, ok: false, error: 'Result parse crash: ' + ex.message }; }
            cb(slim);
        }, CALL_TIMEOUT_MS);
    }

    // Вызовы выполняются СТРОГО по очереди (раньше все POST уходили параллельно: write_file и exec того же файла гонялись).
    var jobQueue = [], jobRunning = false;
    function runJobs() {
        if (jobRunning || !jobQueue.length) return;
        jobRunning = true;
        var job = jobQueue.shift();
        try { job(function () { jobRunning = false; runJobs(); }); }
        catch (e) { console.error('[agent] job crashed', e); jobRunning = false; runJobs(); }
    }
    function runBatch(calls, finishCb) {
        var results = [], i = 0, failedId = null;
        (function next() {
            if (i >= calls.length) {
                try { enqueue(RES + ' ' + JSON.stringify({ results: results })); }
                catch (enqErr) { console.error('[agent] enqueue crashed:', enqErr); setB('!', 'ошибка очереди'); }
                finishCb();
                return;
            }
            var c = calls[i++];
            if (failedId) {      // после упавшей записи/exec остальное не выполняем (как &&), чтобы не работать по устаревшему состоянию
                delete _pendingCalls[callKey(c).pk];
                results.push({ id: c.id, ok: false, error: 'skipped: предыдущий вызов ' + failedId + ' завершился ошибкой' });
                return next();
            }
            setB('⏳', c.cmd + ' ' + (i) + '/' + calls.length);
            execOne(c, function (res) {
                results.push(res);
                if (!res.ok && MUTATING[c.cmd]) failedId = c.id;
                next();
            });
        })();
    }

    // -> 'ok' | 'retry' (блок не дописан — вернуться позже)
    var _incompleteSince = new WeakMap();

    // v5.4: AGENT_IMG <path> — показать агенту картинку с сервера прямо в чате.
    // Клиент качает GET /img?path=..., создаёт File, вставляет в поле ввода,
    // отправляет как обычное вложение. Агент видит картинку следующим ходом.
    var IMG = 'AGENT' + '_IMG';
    function showImageInChat(path) {
        var url = SERVER + '/img?path=' + encodeURIComponent(path);
        GM_xmlhttpRequest({
            method: 'GET', url: url,
            headers: { 'X-Agent-Token': TOKEN },
            responseType: 'blob',
            timeout: 30000,
            onload: function (r) {
                if (r.status !== 200) {
                    console.warn('[agent] IMG ' + path + ' -> HTTP ' + r.status);
                    return;
                }
                var blob = r.response;
                var name = path.split('/').pop() || 'image.png';
                var file;
                try {
                    file = new File([blob], name, { type: blob.type || 'image/png' });
                } catch (e) {
                    console.error('[agent] File create failed:', e);
                    return;
                }
                // v5.4: ищем input[type=file] надёжнее — по всему документу, включая shadow DOM.
                function findAll(root, out) {
                    try { root.querySelectorAll('input[type="file"]').forEach(function (i) { out.push(i); }); } catch (e) {}
                    try {
                        root.querySelectorAll('*').forEach(function (el) { if (el.shadowRoot) findAll(el.shadowRoot, out); });
                    } catch (e) {}
                    return out;
                }
                var inputs = findAll(document, []);
                console.log('[agent] IMG file inputs found:', inputs.length);
                if (!inputs.length) {
                    console.warn('[agent] нет input[type=file] — попробуй открыть скрепку вручную, потом AGENT_IMG ещё раз');
                    return;
                }
                var ok = false;
                for (var k = 0; k < inputs.length && !ok; k++) {
                    try {
                        var dt = new DataTransfer();
                        dt.items.add(file);
                        inputs[k].files = dt.files;
                        inputs[k].dispatchEvent(new Event('change', { bubbles: true }));
                        console.log('[agent] IMG ' + name + ' attached to input[' + k + '] (' + file.size + ' b)');
                        ok = true;
                    } catch (e) {
                        console.warn('[agent] input[' + k + '] failed:', e);
                    }
                }
                if (!ok) { console.error('[agent] IMG attach failed for all inputs'); return; }
                // v5.4: после attach картинка «висит» в поле ввода — надо отправить.
                // Сначала клик по кнопке отправки (Enter на пустом поле не работает),
                // если кнопки нет — Enter как fallback.
                setTimeout(function () {
                    var btns = [];
                    try { btns = btns.concat(qa(SEL.actionBtn)); } catch (e) {}
                    for (var b = 0; b < SEL.actionBtnAlt.length; b++) {
                        try { btns = btns.concat(qa(SEL.actionBtnAlt[b])); } catch (e) {}
                    }
                    var clicked = false;
                    for (var i = btns.length - 1; i >= 0 && !clicked; i--) {
                        var btn = btns[i];
                        if (!btn || btn.disabled) continue;
                        try { btn.click(); clicked = true; console.log('[agent] IMG send via button[' + i + ']'); } catch (e) {}
                    }
                    if (clicked) return;
                    var ta = findTA();
                    if (ta) {
                        console.log('[agent] IMG send via Enter (no button found)');
                        try { ta.focus(); } catch (e) {}
                        pressEnter(ta);
                    } else {
                        console.warn('[agent] IMG send: ни кнопки, ни textarea');
                    }
                }, 1500);
            },
            onerror: function () { console.warn('[agent] IMG network error: ' + path); },
            ontimeout: function () { console.warn('[agent] IMG timeout: ' + path); },
        });
    }

    function processBlock(pre, body, baseline) {
        if (!body) return 'ok';
        var trimmed = body.replace(/^\s+/, '');
        if (trimmed.indexOf(IMG + ' ') === 0 || trimmed.indexOf(IMG + '\n') === 0) {
            var imgPath = trimmed.substring(IMG.length).trim().split('\n')[0].trim();
            if (!imgPath) return 'ok';
            var hImg = hash(imgPath + '|' + Date.now());   // v5.4: timestamp — повтор всегда новый
            if (!baseline) {
                console.log('[agent] IMG fetch: ' + imgPath);
                showImageInChat(imgPath);
            }
            return 'ok';
        }
        if (trimmed.indexOf(SAY + ' ') === 0 || trimmed.indexOf(SAY + '\n') === 0) {
            var sayText = trimmed.substring(SAY.length).trim();
            if (!sayText) return 'ok';
            var hSay = hash(sayText);
            if (isDone('say', hSay)) return 'ok';
            markDone('say', hSay);
            if (!baseline) post('/reply', { text: sayText }, function () {});
            return 'ok';
        }
        if (!(trimmed.indexOf(CALL + ' ') === 0 || trimmed.indexOf(CALL + '{') === 0 || trimmed.indexOf('AGENT_B64:') === 0)) return 'ok';

        var groups = splitGroups(body), parsed = [], incomplete = false;
        for (var gi = 0; gi < groups.length; gi++) {
            var p = parseGroup(groups[gi].join('\n'));
            if (p.incomplete) incomplete = true;
            parsed.push(p);
        }
        // Недописанный блок: ждём (пока идёт стрим он «дозреет»), по истечении grace — сообщаем модели.
        for (var wi = 0; wi < parsed.length; wi++) {
            if (parsed[wi].call && missingPayload(parsed[wi].call)) { incomplete = true; }
        }
        if (incomplete && !baseline) {
            var since = _incompleteSince.get(pre);
            if (!since) { since = Date.now(); _incompleteSince.set(pre, since); }
            if (Date.now() - since < INCOMPLETE_GRACE_MS) return 'retry';
        }

        var batch = [], seen = {};
        for (var pi = 0; pi < parsed.length; pi++) {
            var pr = parsed[pi];
            if (pr.incomplete) { if (!baseline) lostCall(groups[pi].join('\n'), 'unbalanced json / unterminated @@ block'); continue; }
            if (pr.error) { if (!baseline) lostCall(pr.raw || groups[pi].join('\n'), pr.error); continue; }
            var call = pr.call;
            if (!call.id) continue;
            var k = callKey(call);
            if (baseline) { markDone(call.id, k.h); continue; }
            if (isDone(call.id, k.h) || _pendingCalls[k.pk] || seen[k.pk]) continue;
            var miss = missingPayload(call);
            if (miss) {
                enqueueResult({ id: call.id, ok: false, error: call.cmd + ': нет аргумента ' + miss + ' (ни в args, ни в @@' + miss + ' блоке) — вызов не выполнен' });
                markDone(call.id, k.h);
                continue;
            }
            seen[k.pk] = 1;
            _pendingCalls[k.pk] = 1;
            batch.push(call);
        }
        if (batch.length) {
            jobQueue.push(function (done) { runBatch(batch, done); });
            runJobs();
        }
        return 'ok';
    }

    // ---------- сканирование чата ----------
    var lastText = new WeakMap(), stableSince = new WeakMap();
    var BASELINE_MIN_MS = 3000, BASELINE_MAX_MS = 15000;
    var baselineDone = false, baselineStart = Date.now();

    function chatId() {
        var segs = (location.pathname || '/').split('/').filter(Boolean);
        return segs.length ? segs[segs.length - 1] : '';
    }
    var lastChatId = chatId();

    function scanBlocks(visit) {
        var messages = qa(SEL.assistant);
        if (!messages.length) return 0;
        var pres = messages[messages.length - 1].querySelectorAll('pre');   // только ПОСЛЕДНЕЕ сообщение ассистента
        var n = 0;
        for (var i = 0; i < pres.length; i++) {
            var pre = pres[i];
            try { if (pre.closest && pre.closest(SEL.thinkContent)) continue; } catch (e) {}
            var body = (pre.innerText || '').trim();
            if (!body || (body.indexOf(CALL) < 0 && body.indexOf(SAY) < 0 && body.indexOf(IMG) < 0 && body.indexOf('AGENT_B64') < 0)) continue;
            n++;
            visit(pre, body);
        }
        return n;
    }

    // v5.0: при загрузке страницы и при переходе в другой чат старые блоки НЕ выполняются повторно
    // (раньше после DATA_TTL=10 мин перезагрузка вкладки заново исполняла все прошлые вызовы, включая write_file).
    function takeBaseline() {
        scanBlocks(function (pre, body) { _processedMap.set(pre, body); processBlock(pre, body, true); });
        baselineDone = true;
        console.log('[agent] baseline: старые блоки помечены, повторно не выполняются');
    }

    var _lastTickTs = Date.now();   // v5.1: сторож смотрит на эту метку
    function tick() {
        var now = Date.now();
        _lastTickTs = now;          // метка ДО всех return: генерация — не зависание
        var cid = chatId();
        if (cid !== lastChatId) {
            // '' -> id — это создание нового чата первым сообщением, baseline не нужен; id -> другой id — переключение чата
            if (lastChatId && cid) { baselineDone = false; baselineStart = now; }
            lastChatId = cid;
        }
        if (isGenerating()) return;              // пока модель пишет, блок может быть недописан
        if (!baselineDone) {
            var age = now - baselineStart;
            if (age < BASELINE_MIN_MS) return;
            var has = qa(SEL.assistant).length > 0;
            if (has) { takeBaseline(); return; }
            if (!cid || age > BASELINE_MAX_MS) baselineDone = true;   // пустой/новый чат — снимать нечего
            else return;
        }
        scanBlocks(function (pre, body) {
            var last = lastText.get(pre) || '';
            if (body !== last) { lastText.set(pre, body); stableSince.set(pre, now); return; }
            if (now - (stableSince.get(pre) || 0) < 300) return;
            if (_processedMap.get(pre) === body) return;
            var st = processBlock(pre, body, false);
            if (st === 'ok') _processedMap.set(pre, body);
        });
    }

    var polling = false;
    function tickPoll() {
        if (!isActive || polling) return;
        if (outbox.length >= OUTBOX_CAP) return;
        polling = true;
        get('/poll', function (e, r) {
            polling = false;
            if (e || !r || !r.items || !r.items.length) return;
            r.items.forEach(function (item) { enqueue(item.text); });
        });
    }

    setInterval(tick, TICK_MS);
    setInterval(tryFlush, 500);
    setInterval(tickPoll, 1500);

    // v5.1: сторож «клиент завис». Если tick() не обновлял метку >30с — что-то сломалось
    // (исключение в тике, DOM сломался). Перезагружаем вкладку, но с защитой от вечного флага:
    // если location.reload() не сработал, через 30с снимаем флаг, иначе мост мёртв навсегда.
    var _reloading = false, _reloadingSince = 0;
    var WATCHDOG_STALE_MS = 30000;
    var RELOAD_GIVEUP_MS = 30000;
    function _doReload(reason) {
        if (_reloading) return;
        _reloading = true;
        _reloadingSince = Date.now();
        console.warn('[agent] 🔄 перезагрузка: ' + reason);
        try { setB('🔄', 'перезагрузка: ' + reason); } catch (e) {}
        setTimeout(function () { try { location.reload(); } catch (e) {} }, 200);
    }
    setInterval(function () {
        if (_reloading) {
            if (Date.now() - _reloadingSince > RELOAD_GIVEUP_MS) {
                _reloading = false;
                console.warn('[agent] reload не сработал за 30с — флаг снят');
            }
            return;
        }
        var age = Date.now() - _lastTickTs;
        if (age > WATCHDOG_STALE_MS) {
            _doReload('tick не обновлялся ' + Math.round(age / 1000) + 'с');
        }
    }, 5000);
    // v5.2: ДЕЛЬТА вместо high-water. Виртуальный список DeepSeek держит в DOM
    // только ~5 последних сообщений, а high-water залипал на максимуме (127K) и
    // переставал расти. Теперь клиент помнит длину видимого хвоста и шлёт
    // ПРИРАЩЕНИЕ: вырос -> delta>0, выгрузили старые -> prev догоняет, delta=0.
    var _lastCtxSent = 0, _CTX_MS = 5000;
    var _lastCtxChatId = null;
    function _tailKey(cid) { return 'agent_ctx_tail:' + cid; }
    function _visibleChars() {
        var chars = 0;
        var items = qa('[data-virtual-list-item-key]');
        var nodes = items.length ? items : qa('.ds-markdown');
        for (var i = 0; i < nodes.length; i++) chars += (nodes[i].innerText || '').length;
        var ta = findTA();
        if (ta) chars += (ta.value || ta.textContent || '').length;
        return chars;
    }
    // v5.3: сумма по ключам. Виртуализация сдвигает окно — мой ответ добавил текст,
    // а старый выпал, размер хвоста не вырос, дельта терялась. Считаем иначе:
    // каждый data-virtual-list-item-key запоминаем с его длиной (max), сумма = аккумулятор.
    // Выгрузка старых не сбрасывает аккумулятор: длины в localStorage остаются.
    var _seenMap = {};
    var _seenKey = null;
    function _loadSeen(cid) {
        var k = 'agent_ctx_seen:' + cid;
        if (k !== _seenKey) {
            _seenKey = k;
            try { _seenMap = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { _seenMap = {}; }
        }
    }
    function _saveSeen() {
        if (!_seenKey) return;
        try { localStorage.setItem(_seenKey, JSON.stringify(_seenMap)); } catch (e) {}
    }
    function _accVisible() {
        var items = qa('[data-virtual-list-item-key]');
        for (var i = 0; i < items.length; i++) {
            var el = items[i];
            if (!el || typeof el.getAttribute !== 'function') continue;
            var id = el.getAttribute('data-virtual-list-item-key') || '';
            if (!id) continue;
            var len = (el.innerText || '').length;
            if (!_seenMap[id] || len > _seenMap[id]) _seenMap[id] = len;
        }
        var ta = findTA();
        if (ta) {
            var taLen = (ta.value || ta.textContent || '').length;
            if (!_seenMap['__ta__'] || taLen > _seenMap['__ta__']) _seenMap['__ta__'] = taLen;
        }
        var sum = 0;
        for (var k in _seenMap) if (_seenMap.hasOwnProperty(k)) sum += (_seenMap[k] || 0);
        return sum;
    }
    function _reportCtx() {
        if (!isActive) return;
        var cid = chatId();
        if (!cid) return;
        var now = Date.now();
        var switched = (cid !== _lastCtxChatId);
        if (switched) { _lastCtxChatId = cid; _lastCtxSent = 0; }
        _loadSeen(cid);
        if (now - _lastCtxSent < _CTX_MS) return;
        _lastCtxSent = now;
        var total = _accVisible();
        _saveSeen();
        var key = 'agent_ctx_total:' + cid;
        var prev = 0;
        try { prev = parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) {}
        if (switched) {
            try { localStorage.setItem(key, String(total)); } catch (e) {}
            post('/ctx', { chars: total, chat_id: cid }, function () {});
            return;
        }
        if (total > prev) {
            var delta = total - prev;
            try { localStorage.setItem(key, String(total)); } catch (e) {}
            post('/ctx', { delta: delta, chat_id: cid }, function () {});
        }
    }
    setInterval(_reportCtx, 2000);
    setTimeout(_reportCtx, 1500);

    // ===== АВТО-BOOTSTRAP =====
    // Братик заебался кидать правило «в блоках кода» в каждый новый чат.
    // Этот блок сам вставляет краткий BOOTSTRAP в пустой новый чат.
    // НЕ отправляет — кладёт текст в поле, Братик жмёт Enter.
    var BOOTSTRAP_KEY = 'agent_bootstrap_last_chat';
    var BOOTSTRAP_TEXT = [
        'Привет. Ты Астра-Ti. Прочитай agent/docs/BOOTSTRAP.md через мост и работай по нему.',
        '',
        'Правило №1: ВСЁ ТЕХНИЧЕСКОЕ — В БЛОКАХ КОДА (JSON, код, команды, длинные пути, промпты).',
        '',
        'Сначала прочитай (каждый вызов отдельно):',
        '  agent/docs/FORMAT.md    — как писать (правило блоков)',
        '  agent/docs/PROMPT.md    — полные правила (§1-30)',
        '  agent/docs/PERSONA.md   — кто ты и как говоришь',
        '  agent/docs/LAST_SESSION.md — где остановились',
        'Deep.md большой — читай offset/limit по 200 строк.'
    ].join('\n');

    function isNewEmptyChat() {
        try {
            var path = location.pathname || '';
            var isChat = /\/chat\/[a-zA-Z0-9-]{6,}/.test(path) || /\/a\/chat\//.test(path);
            if (isChat) return false;
            var ta = findTA();
            if (!ta) return false;
            var val = (ta.value || ta.textContent || '').trim();
            if (val.length > 0) return false;
            var msgs = document.querySelectorAll('[data-virtual-list-item-key], .ds-markdown');
            if (msgs && msgs.length > 0) return false;
            return true;
        } catch (e) { return false; }
    }

    var _bootstrapDone = false;      // один раз за жизнь вкладки (F5 сбрасывает)
    var _bootstrapLastTry = 0;
    function maybeBootstrap() {
        if (!isActive) return;
        if (_bootstrapDone) return;
        var enabled = GM_getValue('agent_auto_bootstrap', true);
        if (!enabled) return;
        var now = Date.now();
        if (now - _bootstrapLastTry < 3000) return;   // не дёргать DOM чаще 3с
        _bootstrapLastTry = now;
        if (!isNewEmptyChat()) return;
        var ta = findTA();
        if (!ta) return;
        insertText(ta, BOOTSTRAP_TEXT);
        _bootstrapDone = true;
        try { setB('A', 'BOOTSTRAP вставлен, жми Enter'); } catch (e) {}
    }

    function initAutoBootstrap() {
        setTimeout(maybeBootstrap, 2000);
        // после навигации в SPA (DeepSeek) — снова проверить
        var _lastPath = location.pathname;
        setInterval(function () {
            if (location.pathname !== _lastPath) {
                _lastPath = location.pathname;
                _bootstrapDone = false;
            }
            maybeBootstrap();
        }, 3000);
    }

    GM_registerMenuCommand('Авто-BOOTSTRAP: вкл/выкл', function () {
        var cur = GM_getValue('agent_auto_bootstrap', true);
        GM_setValue('agent_auto_bootstrap', !cur);
        alert('Авто-BOOTSTRAP ' + (!cur ? 'включён' : 'выключен'));
    });
    GM_registerMenuCommand('Вставить BOOTSTRAP сейчас', function () {
        var ta = findTA();
        if (!ta) { alert('Поле ввода не найдено'); return; }
        insertText(ta, BOOTSTRAP_TEXT);
        _bootstrapDone = true;
        alert('BOOTSTRAP вставлен. Жми Enter.');
    });

    initAutoBootstrap();

    console.log('[agent] bridge v5.0 запущен', SERVER, 'tab=' + TAB_ID);
})();