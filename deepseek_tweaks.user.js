// ==UserScript==
// @name         DeepSeek Tweaks by Astra
// @namespace    http://tampermonkey.net/
// @version      2.7
// @description  Ширина, шрифты, фон, неон, AI-note, мысли, копирование, счётчик, compact, поиск, экспорт, брендинг, эмодзи, анимации
// @author       Astra-Ti
// @match        https://chat.deepseek.com/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/LegoRobloxer/astra-deepseek-tweaks/main/deepseek_tweaks.user.js
// @downloadURL  https://raw.githubusercontent.com/LegoRobloxer/astra-deepseek-tweaks/main/deepseek_tweaks.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const defaults = {
        wideChat: true,
        font: 'system',
        hideAiNote: true,
        autoGrow: true,
        bgImage: '',
        textColor: '',
        neonColor: '#a97af7',
        neonSize: 10,
        neonWindow: true,
        collapseThoughts: true,
        hotkeys: true,
        compact: false,
        stickyHeader: false,
        scrollBottom: true,
        charCounter: true,
        copyCode: true,
        hideNativeScroll: false,
        exportChat: true,
        chatSearch: true,
        branding: true,
        emojiPicker: true,
        updateCheck: true,
        bgAnim: 'none',
        bgOpacity: 18,
        siteTitle: 'DSeek+',
        faviconData: '',
    };

    let settings = { ...defaults };
    try {
        const saved = localStorage.getItem('ds_tweaks');
        if (saved) settings = { ...settings, ...JSON.parse(saved) };
    } catch(e) {}

    function save() {
        localStorage.setItem('ds_tweaks', JSON.stringify(settings));
        applyStyles();
        hideAiNote();
        processThoughts();
        processCodeBlocks();
        ensureScrollBtn();
        updateCharCounter();
        applySmartWide();
        applyBranding();
    }

    function applyStyles() {
        let css = '';
        
        // Широкий чат: CSS для известных селекторов + JS-автопоиск ниже.
        if (settings.wideChat) {
            css += `
                main, [class*="chat-container"], [class*="conversation"], [class*="messages"] {
                    max-width: 100% !important; width: 100% !important;
                    padding-left: 20px !important; padding-right: 20px !important;
                }
                [class*="message-content"], [class*="markdown"] { max-width: 100% !important; }
            `;
        }

        let fontFamily = '';
        if (settings.font === 'mono') fontFamily = 'Consolas, "Courier New", monospace';
        else if (settings.font === 'serif') fontFamily = 'Georgia, "Times New Roman", serif';
        else if (settings.font === 'comic') fontFamily = '"Comic Sans MS", cursive';
        else fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        css += `body, textarea, input, .markdown, [class*="message"] { font-family: ${fontFamily} !important; }`;

        // Красивые код-блоки
        css += `
            pre, code, [class*="code-block"], [class*="highlight"] {
                background: #1e1e2e !important; color: #a97af7 !important;
                border-radius: 8px !important; border: 1px solid rgba(169, 122, 247, 0.3) !important;
                padding: 12px !important; font-family: Consolas, monospace !important;
                font-size: 13px !important; line-height: 1.5 !important;
                box-shadow: inset 0 0 10px rgba(0,0,0,0.5) !important;
            }
        `;

        if (settings.textColor) {
            css += `.markdown, [class*="message-content"], p, li, span { color: ${settings.textColor} !important; }`;
        }
        if (settings.neonColor && settings.neonSize > 0) {
            css += `.markdown, [class*="message-content"], p, li, span { text-shadow: 0 0 ${settings.neonSize}px ${settings.neonColor}, 0 0 ${settings.neonSize * 2}px ${settings.neonColor} !important; }`;
        }

        // Неон ВОКРУГ ОКНА
        if (settings.neonWindow && settings.neonColor && settings.neonSize > 0) {
            css += `
                body::after {
                    content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    pointer-events: none; z-index: 999999;
                    box-shadow: inset 0 0 ${settings.neonSize * 2}px ${settings.neonColor}, inset 0 0 ${settings.neonSize * 5}px ${settings.neonColor};
                }
            `;
        }

        if (settings.bgImage) {
            css += `
                body { background-image: url('${settings.bgImage}') !important; background-size: cover !important; background-attachment: fixed !important; }
                main, [class*="chat-container"], [class*="conversation"] { background: rgba(0,0,0,0.3) !important; backdrop-filter: blur(5px) !important; }
            `;
        }

        // Кнопки в шапке
        css += `
            #ds-header-tools {
                position: fixed !important;
                top: 12px !important;
                right: 120px !important;
                display: flex !important;
                gap: 8px !important;
                align-items: center !important;
                z-index: 99999 !important;
            }
            .ds-header-btn { cursor: pointer; font-size: 18px; opacity: 0.7; transition: opacity 0.2s, transform 0.2s; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px; }
            .ds-header-btn:hover { opacity: 1; transform: scale(1.1); background: rgba(255,255,255,0.1); }

            /* v2.6: кнопка «Обновить» в нашем стиле */
            .ds-update-btn { display: none !important; align-items: center !important; gap: 6px !important; padding: 5px 10px !important; border-radius: 16px !important;
                cursor: pointer !important; font: 600 12px/1 'Segoe UI', sans-serif !important; white-space: nowrap !important;
                color: ${settings.neonColor || '#a97af7'} !important; background: rgba(20,22,26,.85) !important;
                border: 1.5px solid ${settings.neonColor || '#a97af7'} !important;
                box-shadow: 0 0 6px ${settings.neonColor || '#a97af7'}, 0 0 12px rgba(169,122,247,.4) !important;
                transition: transform .15s, box-shadow .2s !important; animation: ds-update-pulse 2.2s ease-in-out infinite !important; }
            .ds-update-btn.ds-show { display: inline-flex !important; }
            .ds-update-btn:hover { transform: scale(1.06) !important; box-shadow: 0 0 10px ${settings.neonColor || '#a97af7'}, 0 0 22px rgba(169,122,247,.7) !important; animation-play-state: paused !important; }
            .ds-update-btn:active { transform: scale(.96) !important; }
            .ds-update-btn .ds-update-dot { width: 8px !important; height: 8px !important; border-radius: 50% !important; background: ${settings.neonColor || '#a97af7'} !important;
                box-shadow: 0 0 6px ${settings.neonColor || '#a97af7'} !important; animation: ds-update-blink 1.4s ease-in-out infinite !important; }
            @keyframes ds-update-pulse { 0%, 100% { box-shadow: 0 0 6px ${settings.neonColor || '#a97af7'}, 0 0 12px rgba(169,122,247,.4); } 50% { box-shadow: 0 0 10px ${settings.neonColor || '#a97af7'}, 0 0 22px rgba(169,122,247,.7); } }
            @keyframes ds-update-blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
        `;

        // === v2.2: безопасные фичи ===
        // Скроллбар в стиле неона
        css += `
            ::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
            ::-webkit-scrollbar-track { background: #14161a !important; }
            ::-webkit-scrollbar-thumb { background: ${settings.neonColor || '#a97af7'} !important; border-radius: 4px !important; }
            ::-webkit-scrollbar-thumb:hover { background: ${settings.neonColor || '#a97af7'} !important; filter: brightness(1.3) !important; }
        `;

        // Compact mode — меньше отступов
        if (settings.compact) {
            css += `
                [class*="message"] { margin-top: 6px !important; margin-bottom: 6px !important; padding-top: 4px !important; padding-bottom: 4px !important; }
                [class*="markdown"] p { margin-top: 4px !important; margin-bottom: 4px !important; }
                [class*="chat-container"], [class*="conversation"] { gap: 4px !important; }
            `;
        }

        // Sticky header
        if (settings.stickyHeader) {
            css += `
                header, [class*="header"], [class*="topbar"] { position: sticky !important; top: 0 !important; z-index: 1000 !important; backdrop-filter: blur(10px) !important; background: rgba(20,22,26,0.85) !important; }
            `;
        }

        // Кнопка копирования на код-блоках
        css += `
            .ds-code-wrap { position: relative !important; }
            .ds-code-copy { position: absolute !important; top: 6px !important; right: 6px !important; background: rgba(169,122,247,0.15) !important; color: #a97af7 !important; border: 1px solid rgba(169,122,247,0.4) !important; border-radius: 4px !important; padding: 2px 8px !important; font-size: 11px !important; cursor: pointer !important; opacity: 0 !important; transition: opacity 0.15s !important; z-index: 10 !important; font-family: 'Segoe UI', sans-serif !important; }
            .ds-code-wrap:hover .ds-code-copy { opacity: 1 !important; }
            .ds-code-copy:hover { background: rgba(169,122,247,0.3) !important; }
            .ds-code-lang { position: absolute !important; top: 6px !important; left: 8px !important; font-size: 10px !important; color: #8a919b !important; text-transform: uppercase !important; letter-spacing: 0.5px !important; font-family: 'Segoe UI', sans-serif !important; opacity: 0.7 !important; }
        `;

        // === v2.2 риск: поиск по чату ===
        css += `
            #ds-search-bar { position: fixed !important; top: 60px !important; left: 50% !important; transform: translateX(-50%) !important; background: #1e1e2e !important; border: 1px solid ${settings.neonColor || '#a97af7'} !important; border-radius: 10px !important; padding: 8px 12px !important; display: none !important; align-items: center !important; gap: 8px !important; z-index: 100000 !important; box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important; font-family: 'Segoe UI', sans-serif !important; }
            #ds-search-bar.ds-show { display: flex !important; }
            #ds-search-input { background: #14161a !important; color: #e8eaed !important; border: 1px solid rgba(169,122,247,0.3) !important; border-radius: 6px !important; padding: 4px 8px !important; font-size: 13px !important; width: 200px !important; outline: none !important; }
            #ds-search-input:focus { border-color: ${settings.neonColor || '#a97af7'} !important; }
            #ds-search-count { color: #8a919b !important; font-size: 12px !important; min-width: 60px !important; text-align: center !important; }
            .ds-search-btn { background: transparent !important; color: #a97af7 !important; border: 1px solid rgba(169,122,247,0.4) !important; border-radius: 4px !important; padding: 2px 8px !important; cursor: pointer !important; font-size: 13px !important; }
            .ds-search-btn:hover { background: rgba(169,122,247,0.2) !important; }
            mark.ds-search-hit { background: ${settings.neonColor || '#a97af7'} !important; color: #14161a !important; border-radius: 2px !important; padding: 0 2px !important; }
            mark.ds-search-hit.ds-current { background: #fff !important; color: #14161a !important; box-shadow: 0 0 8px ${settings.neonColor || '#a97af7'} !important; }
        `;

        // Кнопка вниз — на месте нативной (floating bottom-right), неоновый круг
        var _neon = settings.neonColor || '#a97af7';
        css += `
            #ds-scroll-bottom {
                position: fixed !important;
                right: 300px !important;
                bottom: 139px !important;
                width: 44px !important;
                height: 44px !important;
                border-radius: 50% !important;
                background: #14161a !important;
                color: ${_neon} !important;
                display: none !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                font-size: 22px !important;
                font-weight: bold !important;
                line-height: 1 !important;
                border: 2px solid ${_neon} !important;
                box-shadow:
                    0 0 8px ${_neon},
                    0 0 16px ${_neon},
                    0 0 32px ${_neon},
                    inset 0 0 12px rgba(255,255,255,0.15) !important;
                z-index: 99998 !important;
                transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s !important;
                animation: ds-neon-pulse 2.4s ease-in-out infinite !important;
                user-select: none !important;
            }
            #ds-scroll-bottom.ds-show { display: flex !important; }
            #ds-scroll-bottom:hover {
                transform: scale(1.15) !important;
                box-shadow:
                    0 0 12px ${_neon},
                    0 0 24px ${_neon},
                    0 0 48px ${_neon},
                    inset 0 0 16px rgba(255,255,255,0.25) !important;
                animation-play-state: paused !important;
            }
            #ds-scroll-bottom:active { transform: scale(0.95) !important; }
            @keyframes ds-neon-pulse {
                0%, 100% {
                    box-shadow:
                        0 0 6px ${_neon},
                        0 0 12px ${_neon},
                        0 0 24px ${_neon},
                        inset 0 0 10px rgba(255,255,255,0.12);
                }
                50% {
                    box-shadow:
                        0 0 10px ${_neon},
                        0 0 20px ${_neon},
                        0 0 40px ${_neon},
                        inset 0 0 14px rgba(255,255,255,0.2);
                }
            }
        `;

        // Счётчик символов
        css += `
            #ds-char-counter { position: fixed !important; right: 24px !important; bottom: 24px !important; background: rgba(20,22,26,0.9) !important; color: #8a919b !important; padding: 4px 10px !important; border-radius: 12px !important; font-size: 11px !important; font-family: 'Segoe UI', sans-serif !important; border: 1px solid rgba(169,122,247,0.3) !important; z-index: 99998 !important; pointer-events: none !important; }
        `;

        // === v2.4: эмодзи-пикер ===
        css += `
            .ds-emoji { position: fixed !important; z-index: 2147483600 !important; width: 280px !important; height: 380px !important; display: flex !important; flex-direction: column !important; border-radius: 18px !important; overflow: hidden !important;
                background: #1e1e2e !important; color: #e8eaed !important; box-shadow: 0 12px 40px rgba(0,0,0,.45), 0 0 0 1px rgba(169,122,247,.3) !important;
                font-family: 'Segoe UI', sans-serif !important; animation: ds-emoji-in .15s ease-out both !important; }
            .ds-emoji.ds-closing { animation: ds-emoji-out .15s ease-in both !important; }
            @keyframes ds-emoji-in { from { opacity: 0; transform: scale(.94); } }
            @keyframes ds-emoji-out { to { opacity: 0; transform: scale(.94); } }
            .ds-emoji-tabs { display: flex !important; gap: 2px !important; padding: 6px 6px 4px !important; border-bottom: 1px solid rgba(169,122,247,.15) !important; flex-shrink: 0 !important; }
            .ds-emoji-tabs button { flex: 1 !important; min-width: 0 !important; height: 30px !important; border: 0 !important; padding: 0 !important; border-radius: 8px !important; background: transparent !important; font-size: 17px !important; line-height: 1 !important; cursor: pointer !important;
                filter: grayscale(1) !important; opacity: .6 !important; transition: opacity .15s, filter .15s, background-color .15s !important; }
            .ds-emoji-tabs button:hover, .ds-emoji-tabs button.ds-on { filter: none !important; opacity: 1 !important; background: rgba(169,122,247,.15) !important; }
            .ds-emoji-body { flex: 1 !important; overflow-y: auto !important; padding: 0 6px 8px !important; overscroll-behavior: contain !important; scrollbar-width: thin !important; }
            .ds-emoji-sec b { display: block !important; position: sticky !important; top: 0 !important; padding: 8px 4px 4px !important; font-size: 12px !important; font-weight: 600 !important; color: #8a919b !important; background-color: #1e1e2e !important; z-index: 1 !important; }
            .ds-emoji-grid { display: grid !important; grid-template-columns: repeat(8, 1fr) !important; }
            .ds-emoji-grid button { aspect-ratio: 1 !important; border: 0 !important; padding: 0 !important; border-radius: 8px !important; background: transparent !important; font-size: 22px !important; line-height: 1 !important; cursor: pointer !important;
                font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif !important; transition: transform .1s, background-color .1s !important; }
            .ds-emoji-grid button:hover { background: rgba(255,255,255,.1) !important; transform: scale(1.15) !important; }
            .ds-emoji-empty { padding: 6px 4px !important; font-size: 12px !important; color: #8a919b !important; }
            .ds-emoji-btn { position: relative !important; }
            .ds-emoji-btn.ds-active { color: #a97af7 !important; }

            /* v2.4: кнопка «вверх» */
            #ds-scroll-top { position: fixed !important; right: 300px !important; bottom: 193px !important; width: 44px !important; height: 44px !important; border-radius: 50% !important;
                background: #14161a !important; color: ${settings.neonColor || '#a97af7'} !important; display: none !important; align-items: center !important; justify-content: center !important;
                cursor: pointer !important; font-size: 22px !important; font-weight: bold !important; line-height: 1 !important; border: 2px solid ${settings.neonColor || '#a97af7'} !important;
                box-shadow: 0 0 6px ${settings.neonColor || '#a97af7'}, 0 0 12px ${settings.neonColor || '#a97af7'}, 0 0 24px ${settings.neonColor || '#a97af7'}, inset 0 0 10px rgba(255,255,255,0.12) !important;
                z-index: 99998 !important; transition: transform .2s ease, box-shadow .2s ease, opacity .2s !important; animation: ds-neon-pulse 2.4s ease-in-out infinite !important; user-select: none !important; }
            #ds-scroll-top.ds-show { display: flex !important; }
            #ds-scroll-top:hover { transform: scale(1.15) !important; box-shadow: 0 0 12px ${settings.neonColor || '#a97af7'}, 0 0 24px ${settings.neonColor || '#a97af7'}, 0 0 48px ${settings.neonColor || '#a97af7'}, inset 0 0 16px rgba(255,255,255,0.25) !important; animation-play-state: paused !important; }
            #ds-scroll-top:active { transform: scale(.95) !important; }

            /* v2.4: тосты */
            .ds-toasts { position: fixed !important; top: 16px !important; left: 50vw !important; transform: translateX(-50%) !important; z-index: 2147483600 !important;
                display: flex !important; flex-direction: column !important; align-items: center !important; gap: 8px !important; pointer-events: none !important;
                width: min(420px, calc(100vw - 24px)) !important; }
            .ds-toast { display: flex !important; align-items: center !important; gap: 10px !important; padding: 12px 16px !important; border-radius: 24px !important;
                background: #1e1e2e !important; color: #e8eaed !important; border: 1px solid rgba(169,122,247,.3) !important;
                box-shadow: 0 14px 36px rgba(0,0,0,.45) !important; backdrop-filter: blur(18px) !important; -webkit-backdrop-filter: blur(18px) !important;
                font-family: 'Segoe UI', sans-serif !important; font-size: 14px !important; pointer-events: auto !important;
                animation: ds-toast-in .25s ease-out !important; cursor: pointer !important; }
            .ds-toast.ds-toast-out { animation: ds-toast-out .25s ease-in forwards !important; }
            .ds-toast .ds-toast-icon { flex-shrink: 0 !important; font-size: 18px !important; }
            .ds-toast .ds-toast-body { display: flex !important; flex-direction: column !important; gap: 2px !important; min-width: 0 !important; }
            .ds-toast .ds-toast-title { font-weight: 600 !important; font-size: 14px !important; }
            .ds-toast .ds-toast-sub { font-size: 12.5px !important; color: #8a919b !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
            .ds-toast.ds-toast-ok { border-color: rgba(76,175,80,.5) !important; }
            .ds-toast.ds-toast-err { border-color: rgba(244,67,54,.5) !important; }
            /* v2.5: фон-анимация */
            #ds-bg-canvas { position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 0 !important; pointer-events: none !important; opacity: 0.18 !important; }
            #ds-bg-canvas.ds-bg-off { display: none !important; }
            /* v2.5: мини-заставка */
            #ds-splash { position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; display: flex !important; align-items: center !important; justify-content: center !important;
                background: #14161a !important; opacity: 1 !important; transition: opacity .4s ease !important; pointer-events: none !important; }
            #ds-splash.ds-splash-out { opacity: 0 !important; }
            #ds-splash .ds-splash-title { font: 900 64px/1 'Arial Black', 'Segoe UI Black', Arial, sans-serif !important; letter-spacing: -2px !important;
                background: linear-gradient(115deg, #a97af7, #ff5bd0, #a97af7) !important; -webkit-background-clip: text !important; background-clip: text !important; -webkit-text-fill-color: transparent !important;
                background-size: 200% 100% !important; animation: ds-splash-shimmer 1.2s ease-in-out infinite !important; }
            @keyframes ds-splash-shimmer { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
            @keyframes ds-toast-in { from { opacity: 0; transform: translateY(-12px); } }
            @keyframes ds-toast-out { to { opacity: 0; transform: translateY(-12px); } }
        `;

        let style = document.getElementById('ds-tweaks-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'ds-tweaks-style';
            document.head.appendChild(style);
        }
        style.textContent = css;
    }

    // --- JS: скрытие AI-note (БЕЗОПАСНОЕ) ---
    function hideAiNote() {
        // Ищем только leaf-элементы (без дочерних узлов), содержащие этот текст
        const elements = document.querySelectorAll('div, span, p');
        for (let el of elements) {
            if (el.children.length === 0 && (el.textContent.includes('AI-generated') || el.textContent.includes('for reference only'))) {
                if (settings.hideAiNote) {
                    el.style.setProperty('display', 'none', 'important');
                } else {
                    el.style.removeProperty('display');
                }
            }
        }
    }

    // --- JS: сворачивание мыслей (БЕЗОПАСНОЕ) ---
    function processThoughts() {
        if (!settings.collapseThoughts) {
            document.querySelectorAll('.ds-thought-hidden').forEach(el => {
                el.style.removeProperty('display');
                el.classList.remove('ds-thought-hidden');
            });
            return;
        }
        
        const elements = document.querySelectorAll('div, span');
        for (let el of elements) {
            const txt = el.textContent.trim();
            if ((txt.startsWith('Thought for') || txt.startsWith('Thinking') || txt.startsWith('思考')) && el.children.length < 3) {
                let parent = el.parentElement;
                while (parent && parent !== document.body) {
                    // Ищем контейнер с текстом мыслей, но БЕЗ полей ввода и кнопок!
                    if (parent.textContent.length > txt.length + 50 && parent.querySelector('textarea, input, button') === null) {
                        if (!parent.dataset.dsThoughtProcessed) {
                            parent.dataset.dsThoughtProcessed = '1';
                            Array.from(parent.children).forEach(child => {
                                if (!child.contains(el) && child.querySelector('textarea, input, button') === null) {
                                    child.style.setProperty('display', 'none', 'important');
                                    child.classList.add('ds-thought-hidden');
                                }
                            });
                            el.style.cursor = 'pointer';
                            el.onclick = (e) => {
                                e.stopPropagation();
                                Array.from(parent.children).forEach(child => {
                                    if (!child.contains(el) && child.querySelector('textarea, input, button') === null) {
                                        const isHidden = child.style.display === 'none';
                                        child.style.setProperty('display', isHidden ? 'block' : 'none', 'important');
                                    }
                                });
                            };
                        }
                        break;
                    }
                    parent = parent.parentElement;
                }
            }
        }
    }

    function createPanel() {
        if (document.getElementById('ds-tweaks-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'ds-tweaks-panel';
        panel.style.cssText = `position: fixed; right: 20px; top: 60px; z-index: 99999; background: #1e1e2e; color: #e8eaed; padding: 15px; border-radius: 12px; font-family: 'Segoe UI', sans-serif; font-size: 13px; width: 260px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: none; border: 1px solid rgba(169,122,247,0.3);`;
        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><b style="color:#a97af7;">Настройки DeepSeek</b><span id="ds-close-panel" style="cursor:pointer; font-size:16px;">✕</span></div>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-wide" ${settings.wideChat?'checked':''}> Широкий чат</label>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-hide-ai" ${settings.hideAiNote?'checked':''}> Скрыть AI-note</label>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-collapse" ${settings.collapseThoughts?'checked':''}> Свернуть мысли</label>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-neon-window" ${settings.neonWindow?'checked':''}> Неон вокруг окна</label>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-compact" ${settings.compact?'checked':''}> Compact mode (плотнее)</label>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-sticky" ${settings.stickyHeader?'checked':''}> Sticky header</label>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-copy" ${settings.copyCode?'checked':''}> Копировать код</label>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-scroll" ${settings.scrollBottom?'checked':''}> Кнопка «вниз»</label>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-counter" ${settings.charCounter?'checked':''}> Счётчик символов</label>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-emoji" ${settings.emojiPicker?'checked':''}> Эмодзи-пикер</label>
            <div style="margin:6px 0;"><label style="font-size:12px; color:#8a919b;">Фон-анимация:</label><br><select id="ds-bg-anim" style="width:100%; background:#14161a; color:#e8eaed; border:1px solid rgba(169,122,247,.3); border-radius:6px; padding:3px 6px; font-size:12px; box-sizing:border-box;"><option value="none">нет</option><option value="matrix">матрица</option><option value="stars">звёзды</option><option value="particles">частицы</option><option value="waves">волны</option><option value="aurora">сияние</option><option value="bokeh">боке</option><option value="grid">неон-сетка</option><option value="snow">снегопад</option></select></div>
            <div style="margin:6px 0;"><label style="font-size:12px; color:#8a919b;">Прозрачность фона: <b id="ds-bg-op-val">${settings.bgOpacity||18}%</b></label><br><input type="range" id="ds-bg-op" min="5" max="50" value="${settings.bgOpacity||18}" style="width:100%;"></div>
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-hide-native" ${settings.hideNativeScroll?'checked':''}> Скрыть нативную кнопку «вниз»</label>
            <hr style="border:none; border-top:1px solid rgba(169,122,247,0.2); margin:10px 0;">
            <label style="display:block; margin:5px 0;"><input type="checkbox" id="ds-branding" ${settings.branding?'checked':''}> Брендинг (title + favicon)</label>
            <div style="margin:6px 0;"><label style="font-size:11px; color:#8a919b;">Название сайта:</label><br><input type="text" id="ds-site-title" value="${settings.siteTitle||'DSeek+'}" style="width:100%; background:#14161a; color:#e8eaed; border:1px solid rgba(169,122,247,0.3); border-radius:4px; padding:3px 6px; font-size:12px; box-sizing:border-box;"></div>
            <div style="margin:6px 0;"><label style="font-size:11px; color:#8a919b;">Favicon (PNG/SVG, до 256 КБ):</label><br><input type="file" id="ds-favicon-file" accept="image/*" style="color:#fff; font-size:11px; width:100%;"><button id="ds-favicon-clear" style="background:#2b3038; color:#fff; border:none; border-radius:4px; padding:2px 6px; cursor:pointer; margin-top:3px; font-size:11px;">Сброс к DS+</button></div>
            <button id="ds-export-md" style="width:100%; margin:8px 0; background:#a97af7; color:#fff; border:none; padding:6px; border-radius:6px; cursor:pointer; font-family:'Segoe UI',sans-serif;">📥 Экспорт чата в .md</button>
            <div style="margin:10px 0;"><label>Шрифт: </label><select id="ds-font" style="background:#2b3038; color:#fff; border:none; padding:3px; border-radius:4px;"><option value="system" ${settings.font==='system'?'selected':''}>Системный</option><option value="mono" ${settings.font==='mono'?'selected':''}>Моно</option><option value="serif" ${settings.font==='serif'?'selected':''}>С засечками</option><option value="comic" ${settings.font==='comic'?'selected':''}>Comic</option></select></div>
            <div style="margin:10px 0;"><label>Цвет текста: </label><input type="color" id="ds-text-color" value="${settings.textColor||'#e8eaed'}" style="vertical-align:middle;"></div>
            <div style="margin:10px 0;"><label>Неон: </label><input type="color" id="ds-neon-color" value="${settings.neonColor||'#a97af7'}" style="vertical-align:middle;"><input type="range" id="ds-neon-size" min="0" max="20" value="${settings.neonSize}" style="vertical-align:middle; width:80px;"></div>
            <div style="margin:10px 0;"><label>Фон: </label><input type="file" id="ds-bg-file" accept="image/*" style="color:#fff; font-size:11px;"><button id="ds-bg-clear" style="background:#2b3038; color:#fff; border:none; border-radius:4px; padding:2px 6px; cursor:pointer; margin-left:5px;">Сброс</button></div>
        `;
        document.body.appendChild(panel);

        document.getElementById('ds-close-panel').onclick = () => panel.style.display = 'none';
        document.getElementById('ds-wide').onchange = (e) => { settings.wideChat = e.target.checked; save(); };
        document.getElementById('ds-hide-ai').onchange = (e) => { settings.hideAiNote = e.target.checked; save(); };
        document.getElementById('ds-collapse').onchange = (e) => { settings.collapseThoughts = e.target.checked; save(); };
        document.getElementById('ds-neon-window').onchange = (e) => { settings.neonWindow = e.target.checked; save(); };
        document.getElementById('ds-compact').onchange = (e) => { settings.compact = e.target.checked; save(); };
        document.getElementById('ds-sticky').onchange = (e) => { settings.stickyHeader = e.target.checked; save(); };
        document.getElementById('ds-copy').onchange = (e) => { settings.copyCode = e.target.checked; save(); };
        document.getElementById('ds-scroll').onchange = (e) => { settings.scrollBottom = e.target.checked; save(); };
        document.getElementById('ds-counter').onchange = (e) => { settings.charCounter = e.target.checked; save(); };
        document.getElementById('ds-emoji').onchange = (e) => { settings.emojiPicker = e.target.checked; save(); };
        document.getElementById('ds-bg-anim').value = settings.bgAnim || 'none';
        document.getElementById('ds-bg-anim').onchange = (e) => { settings.bgAnim = e.target.value; save(); if (typeof dsBgApply === 'function') dsBgApply(); };
        document.getElementById('ds-bg-op').oninput = (e) => { settings.bgOpacity = parseInt(e.target.value); document.getElementById('ds-bg-op-val').textContent = e.target.value + '%'; save(); if (typeof dsBgApply === 'function') dsBgApply(); };
        document.getElementById('ds-hide-native').onchange = (e) => { settings.hideNativeScroll = e.target.checked; save(); };
        document.getElementById('ds-export-md').onclick = () => exportChatToMd();
        document.getElementById('ds-branding').onchange = (e) => { settings.branding = e.target.checked; save(); };
        document.getElementById('ds-site-title').oninput = (e) => { settings.siteTitle = e.target.value; save(); };
        document.getElementById('ds-favicon-file').onchange = (e) => {
            var file = e.target.files[0]; if (!file) return;
            if (file.size > 256 * 1024) { dsToast('Favicon больше 256 КБ', 'Возьми картинку поменьше', 'err'); return; }
            var reader = new FileReader();
            reader.onload = (ev) => { settings.faviconData = ev.target.result; save(); };
            reader.readAsDataURL(file);
        };
        document.getElementById('ds-favicon-clear').onclick = () => { settings.faviconData = ''; save(); };
        document.getElementById('ds-font').onchange = (e) => { settings.font = e.target.value; save(); };
        document.getElementById('ds-text-color').oninput = (e) => { settings.textColor = e.target.value; save(); };
        document.getElementById('ds-neon-color').oninput = (e) => { settings.neonColor = e.target.value; save(); };
        document.getElementById('ds-neon-size').oninput = (e) => { settings.neonSize = parseInt(e.target.value); save(); };
        
        document.getElementById('ds-bg-file').onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader(); reader.onload = (ev) => { settings.bgImage = ev.target.result; save(); };
            reader.readAsDataURL(file);
        };
        document.getElementById('ds-bg-clear').onclick = () => { settings.bgImage = ''; save(); };
    }

    // === v2.6: проверка обновлений с GitHub ===
    var DS_RAW_URL = 'https://raw.githubusercontent.com/LegoRobloxer/astra-deepseek-tweaks/main/deepseek_tweaks.user.js';
    var DS_CURRENT = (function() {
        try {
            if (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) {
                return GM_info.script.version;
            }
        } catch (e) {}
        // fallback: читаем @version из своего же файла — но проще взять 2.7
        return '2.7';
    })();

    function dsParseVer(s) {
        return String(s || '').split('.').map(function(x) { return parseInt(x, 10) || 0; });
    }

    function dsVerCmp(a, b) {
        var x = dsParseVer(a), y = dsParseVer(b);
        for (var i = 0; i < Math.max(x.length, y.length); i++) {
            var d = (x[i] || 0) - (y[i] || 0);
            if (d) return d;
        }
        return 0;
    }

    function dsCheckUpdate() {
        console.log('[ds-tweaks] checkUpdate: current=' + DS_CURRENT + ', updateCheck=' + settings.updateCheck + ', GM_xmlhttpRequest=' + (typeof GM_xmlhttpRequest));
        if (!settings.updateCheck) return;
        var last = parseInt(localStorage.getItem('ds_update_at') || '0', 10);
        var now = Date.now();
        var cached = localStorage.getItem('ds_update_latest') || '';
        var CACHE_TTL = 15 * 60 * 1000; // 15 минут, а не 6 часов — чтобы откат версии подхватывался быстро
        if (cached && now - last < CACHE_TTL) {
            if (dsVerCmp(cached, DS_CURRENT) > 0) dsShowUpdateBtn(cached);
            else {
                var b0 = document.getElementById('ds-update-btn');
                if (b0) b0.classList.remove('ds-show');
            }
            return;
        }
        function onText(txt) {
            localStorage.setItem('ds_update_at', String(Date.now()));
            console.log('[ds-tweaks] checkUpdate: got ' + (txt ? txt.length + ' bytes' : 'empty'));
            if (!txt) return;
            var m = txt.match(/@version\s+([\d.]+)/);
            if (!m) return;
            var latest = m[1];
            localStorage.setItem('ds_update_latest', latest);
            console.log('[ds-tweaks] checkUpdate: latest=' + latest + ', cmp=' + dsVerCmp(latest, DS_CURRENT));
            if (dsVerCmp(latest, DS_CURRENT) > 0) dsShowUpdateBtn(latest);
            else {
                var b = document.getElementById('ds-update-btn');
                if (b) b.classList.remove('ds-show');
            }
        }
        function onFail(e) {
            // записать время попытки, чтобы не долбить GitHub каждую секунду
            localStorage.setItem('ds_update_at', String(Date.now()));
            console.warn('[ds-tweaks] update check failed', e);
        }
        try {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: DS_RAW_URL + '?t=' + now,
                    timeout: 15000,
                    onload: function(r) { onText(r.status === 200 ? r.responseText : null); },
                    onerror: function(e) { onFail(e); },
                    ontimeout: function(e) { onFail(e); }
                });
            } else {
                fetch(DS_RAW_URL + '?t=' + now, { cache: 'no-store' })
                    .then(function(r) { return r.ok ? r.text() : null; })
                    .then(onText)
                    .catch(onFail);
            }
        } catch (e) { onFail(e); }
    }

    function dsShowUpdateBtn(latest) {
        var btn = document.getElementById('ds-update-btn');
        console.log('[ds-tweaks] showUpdateBtn: btn=' + (btn ? 'found' : 'NULL') + ', latest=' + latest);
        if (!btn) return;
        btn.classList.add('ds-show');
        btn.title = 'Доступно обновление: v' + latest + ' (у тебя v' + DS_CURRENT + '). Нажми — откроется установка в Tampermonkey.';
    }

    function injectUpdateButton() {
        if (!settings.updateCheck) {
            var old = document.getElementById('ds-update-btn');
            if (old) old.remove();
            return;
        }
        var tools = document.getElementById('ds-header-tools');
        if (!tools) return;
        if (tools.querySelector('#ds-update-btn')) return;
        var btn = document.createElement('div');
        btn.id = 'ds-update-btn';
        btn.className = 'ds-update-btn';
        btn.innerHTML = '<span class="ds-update-dot"></span><span>Обновить</span>';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            window.open(DS_RAW_URL, '_blank', 'noopener');
        });
        tools.insertBefore(btn, tools.firstChild);
        // если уже знаем, что есть обновление — показать сразу
        var cached = localStorage.getItem('ds_update_latest') || '';
        if (cached && dsVerCmp(cached, DS_CURRENT) > 0) dsShowUpdateBtn(cached);
        // принудительно проверить при вставке
        setTimeout(dsCheckUpdate, 300);
    }

    function injectHeaderButtons() {
        if (document.getElementById('ds-header-tools')) return;

        const tools = document.createElement('div');
        tools.id = 'ds-header-tools';

        const settingsBtn = document.createElement('div');
        settingsBtn.className = 'ds-header-btn';
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.title = 'Настройки DeepSeek Tweaks';
        settingsBtn.onclick = (e) => {
            e.stopPropagation();
            const panel = document.getElementById('ds-tweaks-panel');
            if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        };

        const searchBtn = document.createElement('div');
        searchBtn.className = 'ds-header-btn';
        searchBtn.innerHTML = '🔍';
        searchBtn.title = 'Поиск по чату (Ctrl+F) — Esc закрыть';
        searchBtn.onclick = (e) => { e.stopPropagation(); openSearch(); };

        const logBtn = document.createElement('div');
        logBtn.className = 'ds-header-btn';
        logBtn.innerHTML = '📜';
        logBtn.title = 'Обновления (v2.1)';
        logBtn.onclick = (e) => {
            e.stopPropagation();
            let modal = document.getElementById('ds-changelog-modal');
            if (modal) { modal.remove(); return; }
            modal = document.createElement('div');
            modal.id = 'ds-changelog-modal';
            modal.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1e1e2e; color: #e8eaed; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); z-index: 100000; width: 400px; border: 1px solid #a97af7; font-family: 'Segoe UI', sans-serif;`;
            modal.innerHTML = `
                <h3 style="margin-top:0; color:#a97af7;">Обновления DeepSeek Tweaks</h3>
                <div style="font-size:13px; line-height:1.6; margin-bottom:15px; max-height: 60vh; overflow-y: auto; padding-right: 6px; scrollbar-width: thin;">
                    <b>v2.7 (Сейчас):</b><br>
                    + 🔧 фикс: кэш проверки обновлений 15 мин + сброс при старте<br>
                    + 🐾 мяу<br><br>
                    <b>v2.6:</b><br>
                    + 🐾 мяу (тест кнопки «Обновить»)<br><br>
                    <b>v2.5:</b><br>
                    + 🎨 Фон-анимации: матрица, звёзды, частицы, волны, сияние, боке, неон-сетка, снегопад<br>
                    + Прозрачность фона (5-50%)<br>
                    + ✨ Мини-заставка «DSeek+» при открытии (1.2с, раз за сессию)<br><br>
                    <b>v2.4:</b><br>
                    + 😊 Эмодзи-пикер: 8 категорий, недавние, вставка в textarea<br>
                    + ↑ Кнопка «вверх» (неоновый круг, как «вниз»)<br>
                    + 🔔 Тосты вместо alert() — красивые уведомления сверху<br><br>
                    <b>v2.3:</b><br>
                    + 🎨 Брендинг: свой favicon + название вкладки (DSeek+)<br>
                    + 🔍 Поиск по чату (🔍 в шапке, Ctrl+F, ↑/↓, Esc)<br>
                    + 📥 Экспорт чата в .md<br>
                    + 🔧 Умный широкий чат (автопоиск max-width)<br>
                    + 🎯 Кнопка «вниз»: чёрный круг с неоном, на месте нативной<br>
                    + 🚫 Скрыть нативную кнопку «вниз» (точный селектор)<br><br>
                    <b>v2.2:</b><br>
                    + 📋 Кнопка «копировать» на код-блоках + метка языка<br>
                    + ↓ Кнопка «вниз» при прокрутке вверх<br>
                    + Счётчик символов в чате (внизу справа)<br>
                    + Compact mode — плотнее сообщения<br>
                    + Sticky header — шапка прилипает<br>
                    + Кастомный скроллбар в цвет неона<br><br>
                    <b>v2.1:</b><br>+ Пофикшено удаление поля ввода<br>+ Пофикшено сворачивание мыслей<br><br><br><b>v2.0:</b><br>+ Попытка починить AI-note и мысли
                </div>
                <button onclick="document.getElementById('ds-changelog-modal').remove()" style="background:#a97af7; color:#fff; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Закрыть</button>
            `;
            document.body.appendChild(modal);
        };

        tools.appendChild(searchBtn);
        tools.appendChild(settingsBtn);
        tools.appendChild(logBtn);
        document.body.appendChild(tools);
    }

    // --- v2.2: кнопка «копировать» на код-блоках + язык ---
    function processCodeBlocks() {
        if (!settings.copyCode) {
            // Выключили — убираем обёртки и кнопки, возвращаем pre на место
            document.querySelectorAll('.ds-code-wrap').forEach(wrap => {
                const pre = wrap.querySelector('pre');
                if (pre) {
                    pre.dataset.dsCodeProcessed = '';
                    delete pre.dataset.dsCodeProcessed;
                    wrap.parentNode.insertBefore(pre, wrap);
                }
                wrap.remove();
            });
            return;
        }
        document.querySelectorAll('pre').forEach(pre => {
            if (pre.dataset.dsCodeProcessed) return;
            pre.dataset.dsCodeProcessed = '1';
            const wrap = document.createElement('div');
            wrap.className = 'ds-code-wrap';
            pre.parentNode.insertBefore(wrap, pre);
            wrap.appendChild(pre);

            // Язык из класса code или data-атрибута
            let lang = '';
            const code = pre.querySelector('code');
            if (code) {
                const cls = code.className || '';
                const m = cls.match(/language-([a-z0-9]+)/i);
                if (m) lang = m[1];
            }
            if (!lang) {
                const m2 = (pre.className || '').match(/language-([a-z0-9]+)/i);
                if (m2) lang = m2[1];
            }
            if (lang) {
                const langEl = document.createElement('span');
                langEl.className = 'ds-code-lang';
                langEl.textContent = lang;
                wrap.appendChild(langEl);
            }

            const btn = document.createElement('button');
            btn.className = 'ds-code-copy';
            btn.textContent = '📋 копировать';
            btn.onclick = (e) => {
                e.stopPropagation();
                const text = (code || pre).innerText;
                navigator.clipboard.writeText(text).then(() => {
                    btn.textContent = '✓ скопировано';
                    setTimeout(() => { btn.textContent = '📋 копировать'; }, 1500);
                }).catch(() => {
                    btn.textContent = '✗ ошибка';
                    setTimeout(() => { btn.textContent = '📋 копировать'; }, 1500);
                });
            };
            wrap.appendChild(btn);
        });
    }

    // --- v2.2: кнопка «вниз» ---
    function ensureScrollBtn() {
        // Смотрим ПРЯМО на чекбокс в DOM, а не на settings.
        // Если settings застрял в true (onchange не сработал) — чекбокс спасёт.
        const cb = document.getElementById('ds-scroll');
        const wantBtn = cb ? cb.checked : settings.scrollBottom;
        if (!wantBtn) {
            const b = document.getElementById('ds-scroll-bottom');
            if (b) b.remove();
            return;
        }
        let btn = document.getElementById('ds-scroll-bottom');
        if (!btn) {
            btn = document.createElement('div');
            btn.id = 'ds-scroll-bottom';
            btn.textContent = '↓';
            btn.title = 'К последнему сообщению';
            btn.onclick = () => {
                // Ищем скроллер так же широко, как ensureScrollBtn.
                const sels = 'main, [class*="chat-container"], [class*="conversation"], [class*="scroll"], [class*="message-list"], [class*="chat-content"], [class*="overflow"]';
                let best = null, bestH = 0;
                document.querySelectorAll(sels).forEach(el => {
                    const dh = el.scrollHeight - el.clientHeight;
                    if (dh > 50 && el.scrollHeight > bestH) { best = el; bestH = el.scrollHeight; }
                });
                if (best) {
                    best.scrollTo({ top: best.scrollHeight, behavior: 'smooth' });
                } else {
                    // fallback: скроллим всё, что скроллится
                    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
                    document.querySelectorAll('*').forEach(el => {
                        if (el.scrollHeight > el.clientHeight + 100 && el !== document.body) {
                            el.scrollTop = el.scrollHeight;
                        }
                    });
                }
                console.log('[tweaks] scroll-to-bottom: ' + (best ? (best.className || best.tagName).slice(0, 40) : 'window+all'));
            };
            document.body.appendChild(btn);
        }
        const scroller = (() => {
            // Ищем ЛЮБОЙ скроллящийся элемент, не только main/chat-container.
            const els = document.querySelectorAll('main, [class*="chat-container"], [class*="conversation"], [class*="scroll"], [class*="message-list"], [class*="chat-content"], [class*="overflow"]');
            let best = null, bestH = 0;
            els.forEach(el => { if (el.scrollHeight > el.clientHeight + 50 && el.scrollHeight > bestH) { best = el; bestH = el.scrollHeight; } });
            return best || window;
        })();
        let isFar;
        if (scroller === window) {
            // Скроллится сама страница
            isFar = (window.scrollY + window.innerHeight) < (document.documentElement.scrollHeight - 300);
        } else {
            isFar = (scroller.scrollTop + scroller.clientHeight) < (scroller.scrollHeight - 300);
        }
        // FALLBACK: если скроллер не найден / не скроллится (DeepSeek
        // меняет DOM), показываем кнопку ВСЕГДА, когда чекбокс включён.
        // Иначе она висит в display:none и её не видно (случай 31.10).
        if (scroller === window && document.documentElement.scrollHeight <= window.innerHeight + 10) {
            isFar = true;
        }
        console.log('[tweaks] scroll btn: scroller=' + (scroller === window ? 'window' : (scroller.className || scroller.tagName).slice(0, 40)) + ', isFar=' + isFar);
        btn.classList.toggle('ds-show', isFar);
    }

    // --- v2.2: счётчик символов ---
    function updateCharCounter() {
        // При выключении — удаляем элемент, иначе он висит на экране
        // с последним значением. Случай 31.10: чекбокс off, счётчик остался.
        let el = document.getElementById('ds-char-counter');
        if (!settings.charCounter) {
            if (el) el.remove();
            return;
        }
        if (!el) {
            el = document.createElement('div');
            el.id = 'ds-char-counter';
            document.body.appendChild(el);
        }
        // Считаем видимый текст сообщений
        let total = 0;
        document.querySelectorAll('[class*="markdown"], [class*="message-content"]').forEach(m => {
            total += (m.innerText || '').length;
        });
        const fmt = total.toLocaleString('ru-RU').replace(/,/g, ' ');
        el.textContent = fmt + ' симв.';
    }

    // Ядерная синхронизация: читаем чекбоксы прямо из DOM.
    // Если чекбокс снят, а элемент остался — удаляем. Не полагаемся на settings.
    // --- v2.3: брендинг (title + favicon) ---
    var _faviconDefault = null;
    var _titleDefault = null;

    function defaultFaviconSvg() {
        // Фиолетовый круг с «DS+» — заглушка, пока Братик не загрузит свою.
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
            '<circle cx="32" cy="32" r="30" fill="#a97af7"/>' +
            '<text x="32" y="42" font-family="Segoe UI, sans-serif" font-size="24" font-weight="bold" ' +
            'text-anchor="middle" fill="#14161a">DS+</text></svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function applyBranding() {
        // Title
        if (settings.branding && settings.siteTitle) {
            if (_titleDefault === null) _titleDefault = document.title;
            if (document.title !== settings.siteTitle) {
                document.title = settings.siteTitle;
            }
        } else if (_titleDefault !== null) {
            document.title = _titleDefault;
            _titleDefault = null;
        }

        // Favicon
        var links = document.querySelectorAll('link[rel*="icon"]');
        if (settings.branding) {
            if (!_faviconDefault && links.length) {
                _faviconDefault = links[0].href;
            }
            var href = settings.faviconData || defaultFaviconSvg();
            if (links.length === 0) {
                var link = document.createElement('link');
                link.rel = 'icon';
                link.href = href;
                document.head.appendChild(link);
            } else {
                links.forEach(function(l) { l.href = href; });
            }
        } else if (_faviconDefault) {
            links.forEach(function(l) { l.href = _faviconDefault; });
        }
    }

    // --- Умный широкий чат: автопоиск элементов с ограничением ширины ---
    // CSS-селекторы DeepSeek меняются, поэтому ищем по computed style.
    var _wideApplied = [];
    function applySmartWide() {
        // Снять то, что ставили в прошлый раз
        _wideApplied.forEach(function(el) {
            try { el.style.removeProperty('max-width'); el.style.removeProperty('width'); } catch (e) {}
        });
        _wideApplied = [];
        if (!settings.wideChat) return;
        // Ищем элементы, у которых max-width задан числом < 1500
        document.querySelectorAll('div, main, section, article').forEach(function(el) {
            var cs = window.getComputedStyle(el);
            var mw = cs.maxWidth;
            if (!mw || mw === 'none') return;
            var n = parseInt(mw, 10);
            if (!n || n <= 0 || n >= 1500) return;
            var r = el.getBoundingClientRect();
            if (r.width < 300 || r.height < 80) return;  // слишком мелкий / пустой
            // Не трогаем панели и кнопки
            if (el.id && el.id.indexOf('ds-') === 0) return;
            el.style.setProperty('max-width', '100%', 'important');
            el.style.setProperty('width', '100%', 'important');
            _wideApplied.push(el);
        });
        if (_wideApplied.length) {
            console.log('[tweaks] широкий чат: растянул ' + _wideApplied.length + ' элементов');
        }
    }

    // --- v2.2 риск: поиск по чату ---
    var _searchHits = [];
    var _searchIdx = -1;

    function ensureSearchBar() {
        if (!settings.chatSearch) {
            var b = document.getElementById('ds-search-bar');
            if (b) b.remove();
            return;
        }
        if (document.getElementById('ds-search-bar')) return;
        var bar = document.createElement('div');
        bar.id = 'ds-search-bar';
        bar.innerHTML = '<input id="ds-search-input" placeholder="Поиск по чату...">' +
            '<span id="ds-search-count">0/0</span>' +
            '<button class="ds-search-btn" id="ds-search-prev">↑</button>' +
            '<button class="ds-search-btn" id="ds-search-next">↓</button>' +
            '<button class="ds-search-btn" id="ds-search-close">✕</button>';
        document.body.appendChild(bar);
        var input = document.getElementById('ds-search-input');
        input.addEventListener('input', function() { runSearch(this.value); });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); jumpSearch(e.shiftKey ? -1 : 1); }
            if (e.key === 'Escape') { closeSearch(); }
        });
        document.getElementById('ds-search-next').onclick = function() { jumpSearch(1); };
        document.getElementById('ds-search-prev').onclick = function() { jumpSearch(-1); };
        document.getElementById('ds-search-close').onclick = function() { closeSearch(); };
    }

    function openSearch() {
        ensureSearchBar();
        var bar = document.getElementById('ds-search-bar');
        if (!bar) return;
        bar.classList.add('ds-show');
        var input = document.getElementById('ds-search-input');
        if (input) { input.focus(); input.select(); }
    }

    function closeSearch() {
        var bar = document.getElementById('ds-search-bar');
        if (bar) bar.classList.remove('ds-show');
        clearSearch();
    }

    function clearSearch() {
        document.querySelectorAll('mark.ds-search-hit').forEach(function(m) {
            var parent = m.parentNode;
            if (!parent) return;
            parent.replaceChild(document.createTextNode(m.textContent), m);
            parent.normalize();
        });
        _searchHits = [];
        _searchIdx = -1;
        var c = document.getElementById('ds-search-count');
        if (c) c.textContent = '0/0';
    }

    function _walkTextNodes(root, cb) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        var n;
        while ((n = walker.nextNode())) {
            if (n.parentElement && n.parentElement.closest('#ds-search-bar')) continue;
            cb(n);
        }
    }

    function runSearch(query) {
        clearSearch();
        if (!query || query.length < 2) return;
        var roots = document.querySelectorAll('.ds-markdown, [class*="message-content"], [class*="assistant-message"], [class*="user-message"]');
        var q = query.toLowerCase();
        roots.forEach(function(root) {
            _walkTextNodes(root, function(node) {
                var txt = node.nodeValue || '';
                var low = txt.toLowerCase();
                var idx = 0;
                var pieces = [];
                var last = 0;
                while ((idx = low.indexOf(q, last)) !== -1) {
                    if (idx > last) pieces.push(document.createTextNode(txt.slice(last, idx)));
                    var mark = document.createElement('mark');
                    mark.className = 'ds-search-hit';
                    mark.textContent = txt.slice(idx, idx + query.length);
                    pieces.push(mark);
                    _searchHits.push(mark);
                    last = idx + query.length;
                }
                if (pieces.length) {
                    if (last < txt.length) pieces.push(document.createTextNode(txt.slice(last)));
                    var frag = document.createDocumentFragment();
                    pieces.forEach(function(p) { frag.appendChild(p); });
                    node.parentNode.replaceChild(frag, node);
                }
            });
        });
        _searchIdx = _searchHits.length ? 0 : -1;
        _updateSearchCount();
        _highlightCurrent();
    }

    function jumpSearch(dir) {
        if (!_searchHits.length) return;
        _searchIdx = (_searchIdx + dir + _searchHits.length) % _searchHits.length;
        _highlightCurrent();
        _updateSearchCount();
    }

    function _highlightCurrent() {
        _searchHits.forEach(function(m, i) {
            m.classList.toggle('ds-current', i === _searchIdx);
        });
        if (_searchHits[_searchIdx]) {
            _searchHits[_searchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function _updateSearchCount() {
        var c = document.getElementById('ds-search-count');
        if (!c) return;
        if (!_searchHits.length) { c.textContent = '0/0'; return; }
        c.textContent = (_searchIdx + 1) + '/' + _searchHits.length;
    }

    // --- v2.2 риск: экспорт чата в .md ---
    function exportChatToMd() {
        try {
            var msgs = [];
            var nodes = document.querySelectorAll('.ds-markdown, [class*="message-content"], [class*="assistant-message"], [class*="user-message"]');
            var seen = new Set();
            nodes.forEach(function(el) {
                if (seen.has(el)) return;
                seen.add(el);
                var txt = (el.innerText || '').trim();
                if (!txt) return;
                // Определяем роль: если внутри есть кнопки копирования у ассистента — обычно ассистент.
                // Простая эвристика: чётные/нечётные блоки или класс.
                var role = 'Вы';
                var cls = (el.className || '').toString();
                var parent = el.closest('[class*="assistant"], [class*="user"], [class*="message"]');
                var pcls = parent ? (parent.className || '').toString() : '';
                if (/assistant|ai|bot/i.test(cls) || /assistant|ai|bot/i.test(pcls)) role = 'DeepSeek';
                msgs.push({ role: role, text: txt });
            });
            if (!msgs.length) { dsToast('Не нашла сообщений для экспорта', 'В этом чате пусто', 'err'); return; }
            var md = '# DeepSeek чат\n\n_Экспорт: ' + new Date().toLocaleString('ru-RU') + '_\n\n';
            msgs.forEach(function(m) {
                md += '## ' + m.role + '\n\n' + m.text + '\n\n---\n\n';
            });
            var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'deepseek_chat_' + Date.now() + '.md';
            document.body.appendChild(a);
            a.click();
            setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            console.log('[tweaks] экспорт: ' + msgs.length + ' сообщений');
        } catch (e) {
            dsToast('Экспорт упал', e.message, 'err');
            console.error('[tweaks] export error:', e);
        }
    }

    // --- v2.2: скрыть нативную кнопку «вниз» DeepSeek ---
    // Эвристика: кнопки/div с svg внутри, positioned внизу справа, не наши.
    // Если не сработает — Братик даст точный селектор через F12.
    // Держим ссылки на скрытые элементы — data-атрибут теряется при
    // перерисовке DOM DeepSeek, а inline display:none остаётся. Массив надёжнее.
    var _hiddenNative = [];

    function _restoreNative() {
        _hiddenNative.forEach(el => {
            try {
                el.style.removeProperty('display');
                el.style.removeProperty('visibility');
                el.style.removeProperty('opacity');
                delete el.dataset.dsNativeHidden;
            } catch (e) {}
        });
        _hiddenNative = [];
        // Плюс страховка: всё, что помечено data-атрибутом, тоже вернуть.
        document.querySelectorAll('[data-ds-native-hidden]').forEach(el => {
            try {
                el.style.removeProperty('display');
                el.style.removeProperty('visibility');
                el.style.removeProperty('opacity');
                delete el.dataset.dsNativeHidden;
            } catch (e) {}
        });
    }

    function hideNativeScroll() {
        // Если чекбокс снят — вернуть всё, что мы спрятали.
        if (!settings.hideNativeScroll) {
            _restoreNative();
            return;
        }
        // ТОЧНЫЙ селектор из F12 (2026-10-31):
        //   нативная кнопка «вниз» DeepSeek = [role="button"].ds-button--floating
        //   (класс ds-button--outlinedNeutral ds-button--outlined ds-button--circle
        //    ds-button--m ds-button--icon-relative-m ds-button--floating)
        // Широкий поиск оставлен как fallback на случай, если класс сменят.
        var targets = [];
        document.querySelectorAll('[role="button"].ds-button--floating').forEach(el => targets.push(el));
        if (targets.length === 0) {
            // fallback: любой [role=button] с SVG в правом нижнем углу,
            // кроме нашей и «отправить».
            document.querySelectorAll('[role="button"], button').forEach(el => {
                if (el.id === 'ds-scroll-bottom') return;
                if (el.classList.contains('ds-button--primary') &&
                    el.classList.contains('ds-button--filled')) return;
                if (!el.querySelector('svg')) return;
                const r = el.getBoundingClientRect();
                if (r.width < 20 || r.height < 20) return;
                if (r.bottom > window.innerHeight - 250 && r.right > window.innerWidth - 200) targets.push(el);
            });
        }
        targets.forEach(el => {
            if (el.dataset.dsNativeHidden) return;
            el.style.setProperty('display', 'none', 'important');
            el.dataset.dsNativeHidden = '1';
            if (_hiddenNative.indexOf(el) === -1) _hiddenNative.push(el);
            console.log('[tweaks] скрыл нативную кнопку вниз:', el.className.slice(0, 100));
        });
    }

    function enforceToggles() {
        const cbScroll = document.getElementById('ds-scroll');
        const b = document.getElementById('ds-scroll-bottom');
        // Диагностика: видно в F12 -> Console, что видит скрипт.
        if (b || (cbScroll && !cbScroll.checked)) {
            console.log('[tweaks] enforce: cbScroll=' + (cbScroll ? cbScroll.checked : 'null') +
                        ', btn=' + (b ? 'есть' : 'нет') +
                        ', settings.scrollBottom=' + settings.scrollBottom);
        }
        if (cbScroll && !cbScroll.checked) {
            if (b) b.remove();
        }
        const cbCounter = document.getElementById('ds-counter');
        if (cbCounter && !cbCounter.checked) {
            const c = document.getElementById('ds-char-counter');
            if (c) c.remove();
        }
        const cbCopy = document.getElementById('ds-copy');
        if (cbCopy && !cbCopy.checked) {
            document.querySelectorAll('.ds-code-wrap').forEach(wrap => {
                const pre = wrap.querySelector('pre');
                if (pre) wrap.parentNode.insertBefore(pre, wrap);
                wrap.remove();
            });
        }
    }

    // === v2.4: эмодзи-пикер ===
    var EMOJI_SETS = [
        ['😀', 'Смайлы', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 🫠 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🫣 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾'],
        ['👍', 'Жесты и люди', '👋 🤚 🖐️ ✋ 🖖 🫱 🫲 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦵 🦶 👂 👃 🧠 🫀 👀 👁️ 👅 👄 🫦 👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👮 🕵️ 💂 🥷 👷 🤴 👸 👳 🤵 👰 🤰 👼 🎅 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟 💆 💇 🚶 🧍 🧎 🏃 💃 🕺 👯 🧖 🧗 🤺 🏇 ⛷️ 🏂 🏄 🚣 🏊 🚴 🤸 🤼 🤽 🤾 🤹 🧘 🛀 🛌 👭 👫 👬 💏 💑 👪'],
        ['🐱', 'Животные и природа', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🐈 🐓 🦃 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿️ 🦔 🐾 🐉 🐲 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍃 🍂 🍁 🍄 🌾 💐 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌚 🌙 🌎 🪐 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 ☀️ 🌤️ ⛅ ☁️ 🌧️ ⛈️ 🌩️ ❄️ ☃️ ⛄ 💨 💧 💦 🌊'],
        ['🍔', 'Еда и напитки', '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🫓 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🥫 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊 🥄 🍴 🍽️'],
        ['⚽', 'Занятия', '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 🏋️ 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🪗 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🕹️ 🎰 🧩'],
        ['🚗', 'Поездки и места', '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛴 🚲 🛵 🏍️ 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁'],
        ['💡', 'Предметы', '⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽️ 🎞️ 📞 ☎️ 📟 📠 📺 📻 🎙️ ⏱️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 💸 💵 💴 💶 💷 🪙 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ 🔮 📿 🧿 💈 ⚗️ 🔭 🔬 🕳️ 🩹 🩺 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡️ 🧹 🧺 🧻 🚽 🚿 🛁 🧼 🪥 🪒 🧽 🧴 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🧸 🪆 🖼️ 🪞 🪟 🛍️ 🛒 🎁 🎈 🎏 🎀 🪄 🪅 🎊 🎉 🎎 🏮 🎐 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 📪 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓'],
        ['❤️', 'Символы', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 ☯️ ☦️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ⚛️ ☢️ ☣️ 📴 📳 ✴️ 🆚 💮 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 💹 ❇️ ✳️ ❎ 🌐 💠 🌀 💤 🚾 ♿ 🅿️ 🚹 🚺 🚼 ⚧️ 🚻 🎦 📶 🔣 ℹ️ 🔤 🆖 🆗 🆙 🆒 🆕 🆓 🔟 🔢 ▶️ ⏸️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ ⤴️ ⤵️ 🔀 🔁 🔂 🔄 🔃 🎵 🎶 ➕ ➖ ➗ ✖️ ♾️ 💲 💱 ™️ ©️ ®️ 〰️ ➰ ➿ 🔚 🔙 🔛 🔝 🔜 ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾ ◽ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫 🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 💬 💭 🗯️ ♠️ ♣️ ♥️ ♦️ 🃏 🎴 🀄'],
        ['🏳️', 'Флаги', '🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️ 🇷🇺 🇺🇦 🇧🇾 🇰🇿 🇺🇸 🇬🇧 🇩🇪 🇫🇷 🇮🇹 🇪🇸 🇵🇱 🇹🇷 🇯🇵 🇰🇷 🇨🇳 🇮🇳 🇧🇷 🇨🇦 🇦🇺 🇦🇲 🇬🇪 🇦🇿 🇺🇿 🇰🇬 🇹🇯 🇲🇩 🇱🇻 🇱🇹 🇪🇪 🇫🇮 🇸🇪 🇳🇴 🇩🇰 🇳🇱 🇧🇪 🇨🇭 🇦🇹 🇨🇿 🇸🇰 🇭🇺 🇷🇴 🇧🇬 🇷🇸 🇬🇷 🇮🇱 🇦🇪 🇪🇬 🇲🇽 🇦🇷 🇹🇭 🇻🇳 🇮🇩']
    ];
    var EMOJI_RECENT_MAX = 24;

    function emojiRecent() {
        try {
            var r = JSON.parse(localStorage.getItem('ds_emoji_recent') || '[]');
            return Array.isArray(r) ? r : [];
        } catch (e) { return []; }
    }

    function emojiRemember(e) {
        var r = emojiRecent().filter(function(x) { return x !== e; });
        r.unshift(e);
        if (r.length > EMOJI_RECENT_MAX) r = r.slice(0, EMOJI_RECENT_MAX);
        try { localStorage.setItem('ds_emoji_recent', JSON.stringify(r)); } catch (e) {}
    }

    var emojiPickerEl = null;

    function buildEmojiPicker(onPick) {
        var el = document.createElement('div');
        el.className = 'ds-emoji';
        var recent = emojiRecent();
        var secs = [['🕘', 'Недавние', recent]].concat(EMOJI_SETS.map(function(s) { return [s[0], s[1], s[2].split(' ')]; }));
        el.innerHTML = '<div class="ds-emoji-tabs">' + secs.map(function(s, k) {
            return '<button type="button" title="' + s[1] + '" data-k="' + k + '">' + s[0] + '</button>';
        }).join('') + '</div><div class="ds-emoji-body"></div>';
        var body = el.querySelector('.ds-emoji-body');
        secs.forEach(function(s, k) {
            var sec = document.createElement('section');
            sec.className = 'ds-emoji-sec';
            sec.dataset.k = k;
            var b = document.createElement('b');
            b.textContent = s[1];
            sec.appendChild(b);
            if (!s[2].length) {
                var e = document.createElement('div');
                e.className = 'ds-emoji-empty';
                e.textContent = 'Здесь появятся эмодзи, которые ты выбирал';
                sec.appendChild(e);
            } else {
                var g = document.createElement('div');
                g.className = 'ds-emoji-grid';
                s[2].forEach(function(em) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = em;
                    btn.addEventListener('click', function() {
                        if (onPick(em) !== false) emojiRemember(em);
                    });
                    g.appendChild(btn);
                });
                sec.appendChild(g);
            }
            body.appendChild(sec);
        });
        var tabs = Array.prototype.slice.call(el.querySelectorAll('.ds-emoji-tabs button'));
        var mark = function() {
            var y = body.scrollTop + 4, cur = 0;
            el.querySelectorAll('.ds-emoji-sec').forEach(function(sc) {
                if (sc.offsetTop <= y) cur = +sc.dataset.k;
            });
            tabs.forEach(function(t) { t.classList.toggle('ds-on', +t.dataset.k === cur); });
        };
        body.addEventListener('scroll', mark, { passive: true });
        el.querySelector('.ds-emoji-tabs').addEventListener('click', function(e) {
            var t = e.target.closest('button');
            if (!t) return;
            var sc = body.querySelector('.ds-emoji-sec[data-k="' + t.dataset.k + '"]');
            if (sc) body.scrollTo({ top: sc.offsetTop, behavior: 'smooth' });
        });
        el.addEventListener('mousedown', function(e) { e.preventDefault(); });
        if (!recent.length) {
            var first = body.querySelector('.ds-emoji-sec[data-k="1"]');
            if (first) body.scrollTop = first.offsetTop;
        }
        mark();
        return el;
    }

    function closeEmojiPicker() {
        if (!emojiPickerEl) return;
        var old = emojiPickerEl;
        emojiPickerEl = null;
        old.classList.add('ds-closing');
        setTimeout(function() { old.remove(); }, 150);
        document.removeEventListener('pointerdown', emojiOutside, true);
        document.removeEventListener('keydown', emojiKey, true);
        window.removeEventListener('resize', closeEmojiPicker);
    }

    function emojiOutside(e) {
        if (emojiPickerEl && !emojiPickerEl.contains(e.target) && !e.target.closest('.ds-emoji-trigger')) closeEmojiPicker();
    }

    function emojiKey(e) {
        if (e.key === 'Escape' && emojiPickerEl) { e.stopPropagation(); closeEmojiPicker(); }
    }

    function openEmojiPicker(btn, onPick) {
        if (emojiPickerEl) { closeEmojiPicker(); return; }
        var el = buildEmojiPicker(onPick);
        document.body.appendChild(el);
        emojiPickerEl = el;
        var r = btn.getBoundingClientRect();
        var W = 280, H = 380, gap = 8;
        var top = (innerHeight - r.bottom >= H + gap) ? r.bottom + gap : Math.max(gap, r.top - H - gap);
        var left = Math.min(r.left, innerWidth - W - gap);
        if (innerWidth - r.left < W && innerWidth - r.right < W) left = Math.max(gap, r.right - W);
        el.style.top = top + 'px';
        el.style.left = Math.max(gap, left) + 'px';
        document.addEventListener('pointerdown', emojiOutside, true);
        document.addEventListener('keydown', emojiKey, true);
        window.addEventListener('resize', closeEmojiPicker);
    }

    function findChatInput() {
        // Ищем поле ввода сообщения, не поиск и не модалки.
        var all = document.querySelectorAll('textarea');
        for (var i = 0; i < all.length; i++) {
            var ta = all[i];
            if (ta.type === 'search') continue;
            if (ta.closest('[class*="search"]')) continue;
            if (ta.offsetParent === null) continue;
            return ta;
        }
        // contenteditable-фолбэк (React/ProseMirror)
        var ces = document.querySelectorAll('[contenteditable="true"]');
        for (var j = 0; j < ces.length; j++) {
            var ce = ces[j];
            if (ce.offsetParent === null) continue;
            if (ce.closest('[class*="search"]')) continue;
            return ce;
        }
        return null;
    }

    function insertEmojiToTextarea(emoji) {
        var el = findChatInput();
        if (!el) return false;
        if (el.tagName === 'TEXTAREA') {
            var start = el.selectionStart != null ? el.selectionStart : el.value.length;
            var end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
            var newVal = el.value.substring(0, start) + emoji + el.value.substring(end);
            // React слушает нативный сеттер value, а не присваивание.
            try {
                var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                setter.call(el, newVal);
            } catch (e) { el.value = newVal; }
            var pos = start + emoji.length;
            try { el.selectionStart = el.selectionEnd = pos; } catch (e) {}
            el.focus();
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        // contenteditable: вставляем через execCommand, он сохраняет курсор и триггерит input.
        el.focus();
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
            var range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        try {
            var ok = document.execCommand('insertText', false, emoji);
            if (!ok) {
                // совсем старый браузер
                var r = sel.getRangeAt(0);
                r.deleteContents();
                var tn = document.createTextNode(emoji);
                r.insertNode(tn);
                r.setStartAfter(tn);
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
            }
        } catch (e) {
            return false;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    function ensureEmojiButton() {
        if (!settings.emojiPicker) {
            var old = document.querySelector('.ds-emoji-trigger');
            if (old) old.remove();
            return;
        }
        // Ищем контейнер с полем ввода DeepSeek. Кнопку ставим рядом с textarea.
        var ta = document.querySelector('textarea');
        if (!ta) return;
        var host = ta.parentElement;
        if (!host) return;
        // Уже есть?
        var mine = host.querySelector(':scope > .ds-emoji-trigger');
        if (mine) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ds-emoji-trigger ds-emoji-btn';
        btn.title = 'Эмодзи';
        btn.innerHTML = '😊';
        btn.style.cssText = 'position: absolute !important; right: 8px !important; bottom: 8px !important; z-index: 10 !important; background: transparent !important; border: 0 !important; cursor: pointer !important; font-size: 18px !important; padding: 4px 6px !important; border-radius: 8px !important; opacity: .7 !important; transition: opacity .15s, background-color .15s !important;';
        btn.addEventListener('mouseenter', function() { btn.style.opacity = '1'; btn.style.backgroundColor = 'rgba(169,122,247,.15)'; });
        btn.addEventListener('mouseleave', function() { btn.style.opacity = '.7'; btn.style.backgroundColor = 'transparent'; btn.classList.remove('ds-active'); });
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            btn.classList.toggle('ds-active', !emojiPickerEl);
            openEmojiPicker(btn, function(em) {
                var ok = insertEmojiToTextarea(em);
                if (!ok) dsToast('Не удалось вставить эмодзи', 'Поле ввода не найдено', 'err');
                return ok;
            });
        });
        // Позиционируем: если parent не position: relative — сделаем relative.
        var cs = getComputedStyle(host);
        if (cs.position === 'static') host.style.position = 'relative';
        host.appendChild(btn);
    }

    // === v2.5: мини-заставка «DSeek+» ===
    function showSplash() {
        if (sessionStorage.getItem('ds_splash_shown')) return;
        sessionStorage.setItem('ds_splash_shown', '1');
        var el = document.createElement('div');
        el.id = 'ds-splash';
        var t = document.createElement('div');
        t.className = 'ds-splash-title';
        t.textContent = 'DSeek+';
        el.appendChild(t);
        document.documentElement.appendChild(el);
        setTimeout(function() {
            el.classList.add('ds-splash-out');
            setTimeout(function() { el.remove(); }, 450);
        }, 1200);
    }

    // === v2.5: фон-анимация (bgEngine, Canvas 2D) ===
    var DS_BG_CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    var dsBgCanvas = null, dsBgCtx = null, dsBgEngine = null, dsBgRaf = 0, dsBgName = '', dsBgLast = 0;

    function dsBgCreateEngine() {
        var W = 0, H = 0, bg = null, bgName = '', mouse = { x: -1e4, y: -1e4 };
        var rand = function(a, b) { return a + Math.random() * (b - a); };
        var hsla = function(h, s, l, a) { return 'hsla(' + Math.round(h) + ',' + Math.round(s) + '%,' + Math.round(l) + '%,' + a + ')'; };
        var spriteCache = new Map();
        function sprite(kind, h, s, l) {
            var key = kind + Math.round(h) + ',' + Math.round(s) + ',' + Math.round(l);
            var c = spriteCache.get(key);
            if (c) return c;
            if (spriteCache.size > 300) spriteCache.clear();
            c = document.createElement('canvas');
            var g = c.getContext('2d');
            if (kind === 'curtain') {
                c.width = 1; c.height = 128;
                var grad = g.createLinearGradient(0, 0, 0, 128);
                grad.addColorStop(0, hsla(h, s, l, 0));
                grad.addColorStop(0.55, hsla(h, s, l, 0.3));
                grad.addColorStop(0.9, hsla(h, s, l + 10, 1));
                grad.addColorStop(1, hsla(h, s, l, 0));
                g.fillStyle = grad; g.fillRect(0, 0, 1, 128);
            } else {
                c.width = c.height = 64;
                var rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
                var stops = kind === 'disc' ? [[0, 0.5], [0.72, 0.6], [0.86, 0.3], [1, 0]] : [[0, 1], [0.35, 0.4], [0.7, 0.08], [1, 0]];
                stops.forEach(function(st) { rad.addColorStop(st[0], hsla(h, s, l, st[1])); });
                g.fillStyle = rad; g.fillRect(0, 0, 64, 64);
            }
            spriteCache.set(key, c);
            return c;
        }
        function drawSprite(kind, x, y, r, h, s, l, a) {
            if (dsBgCtx.globalAlpha === undefined) return;
            dsBgCtx.globalAlpha = Math.max(0, Math.min(1, a));
            dsBgCtx.drawImage(sprite(kind, h, s, l), x - r, y - r, r * 2, r * 2);
            dsBgCtx.globalAlpha = 1;
        }
        function fadeOut(k, dt) {
            var a = 1 - Math.pow(1 - k, dt);
            if (a < 0.08) return;
            dsBgCtx.globalCompositeOperation = 'destination-out';
            dsBgCtx.fillStyle = 'rgba(0,0,0,' + a + ')';
            dsBgCtx.fillRect(0, 0, W, H);
            dsBgCtx.globalCompositeOperation = 'source-over';
        }
        var WAVES = [
            { a1: 100, f1: 0.008, s1: 0.4, a2: 50, f2: 0.018, s2: 0.7, a3: 70, f3: 0.004, s3: 0.25, al: 0.45, off: 0, dh: 0, dl: 15 },
            { a1: 80, f1: 0.009, s1: 0.5, a2: 40, f2: 0.020, s2: 0.8, a3: 60, f3: 0.005, s3: 0.3, al: 0.35, off: 1.5, dh: 15, dl: 10 },
            { a1: 60, f1: 0.010, s1: 0.6, a2: 30, f2: 0.022, s2: 0.9, a3: 50, f3: 0.006, s3: 0.35, al: 0.28, off: 3.0, dh: -15, dl: 5 },
            { a1: 40, f1: 0.011, s1: 0.7, a2: 20, f2: 0.025, s2: 1.0, a3: 30, f3: 0.007, s3: 0.4, al: 0.20, off: 4.5, dh: 30, dl: 0 }
        ];
        var BACKGROUNDS = {
            matrix: {
                init: function() {
                    var size = 15;
                    var cols = [];
                    var n = Math.ceil(W / size);
                    for (var i = 0; i < n; i++) cols.push({ y: rand(-H / size, H / size), v: rand(0.35, 1), prev: null });
                    return { size: size, cols: cols };
                },
                draw: function(s, dt, th) {
                    fadeOut(0.06, dt);
                    dsBgCtx.font = s.size + 'px monospace';
                    dsBgCtx.textBaseline = 'top';
                    for (var i = 0; i < s.cols.length; i++) {
                        var c = s.cols[i];
                        var cell = Math.floor(c.y);
                        c.y += c.v * dt;
                        var next = Math.floor(c.y);
                        if (next !== cell) {
                            var x = i * s.size;
                            if (c.prev) {
                                dsBgCtx.clearRect(x, c.prev.y * s.size, s.size, s.size);
                                dsBgCtx.fillStyle = hsla(th.h + rand(-12, 12), th.s, 45, 1);
                                dsBgCtx.fillText(c.prev.ch, x, c.prev.y * s.size);
                            }
                            var ch = DS_BG_CHARS[Math.floor(Math.random() * DS_BG_CHARS.length)];
                            dsBgCtx.fillStyle = hsla(th.h, Math.min(th.s, 50), 88, 1);
                            dsBgCtx.fillText(ch, x, next * s.size);
                            c.prev = { ch: ch, y: next };
                        }
                        if (c.y * s.size > H && Math.random() < 0.03 * dt) { c.y = rand(-15, 0); c.v = rand(0.35, 1); c.prev = null; }
                    }
                }
            },
            stars: {
                init: function() {
                    var n = Math.min(600, Math.floor(W * H / 3500));
                    var stars = [];
                    for (var i = 0; i < n; i++) {
                        var d = Math.pow(Math.random(), 2);
                        stars.push({ x: rand(0, W), y: rand(0, H), d: d, r: 0.5 + d * 1.8, ph: rand(0, 6.3), sp: rand(0.03, 0.1) });
                    }
                    return { stars: stars, shoot: null, wait: rand(40, 120) };
                },
                draw: function(s, dt, th) {
                    dsBgCtx.clearRect(0, 0, W, H);
                    var S = Math.min(100, th.s * 1.2);
                    var packs = [];
                    for (var p = 0; p < 8; p++) packs.push(new Path2D());
                    for (var i = 0; i < s.stars.length; i++) {
                        var st = s.stars[i];
                        st.ph += st.sp * dt;
                        st.x -= (0.03 + st.d * 0.3) * dt;
                        if (st.x < -5) { st.x = W + 5; st.y = rand(0, H); }
                        var a = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(st.ph));
                        if (st.r > 1.4) drawSprite('glow', st.x, st.y, st.r * 7, th.h, S, 70, a * 0.3);
                        var pack = packs[Math.min(7, Math.floor(a * 8))];
                        pack.moveTo(st.x + st.r, st.y);
                        pack.arc(st.x, st.y, st.r, 0, Math.PI * 2);
                    }
                    dsBgCtx.fillStyle = hsla(th.h, S, 82, 1);
                    packs.forEach(function(pack, k) { dsBgCtx.globalAlpha = (k + 0.5) / 8; dsBgCtx.fill(pack); });
                    dsBgCtx.globalAlpha = 1;
                    s.wait -= dt;
                    if (!s.shoot && s.wait <= 0) {
                        s.shoot = { x: rand(W * 0.3, W * 1.05), y: rand(-20, H * 0.35), vx: -rand(16, 24), vy: rand(6, 10), life: 1 };
                        s.wait = rand(80, 220);
                    }
                    var sh = s.shoot;
                    if (sh) {
                        sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= 0.035 * dt;
                        var tx = sh.x - sh.vx * 7, ty = sh.y - sh.vy * 7;
                        var tail = dsBgCtx.createLinearGradient(sh.x, sh.y, tx, ty);
                        tail.addColorStop(0, hsla(th.h, S * 0.5, 95, Math.max(0, sh.life)));
                        tail.addColorStop(1, hsla(th.h, S, 70, 0));
                        dsBgCtx.strokeStyle = tail;
                        dsBgCtx.lineWidth = 2; dsBgCtx.lineCap = 'round';
                        dsBgCtx.beginPath(); dsBgCtx.moveTo(sh.x, sh.y); dsBgCtx.lineTo(tx, ty); dsBgCtx.stroke();
                        drawSprite('glow', sh.x, sh.y, 10, th.h, S * 0.5, 90, sh.life * 0.8);
                        if (sh.life <= 0 || sh.x < -200 || sh.y > H + 200) s.shoot = null;
                    }
                }
            },
            particles: {
                init: function() {
                    var n = Math.min(130, Math.floor(W * H / 14000));
                    var ps = [];
                    for (var i = 0; i < n; i++) ps.push({ x: rand(0, W), y: rand(0, H), vx: rand(-0.6, 0.6), vy: rand(-0.6, 0.6), r: rand(1.2, 3), ph: rand(0, 6.3) });
                    return { ps: ps };
                },
                draw: function(s, dt, th) {
                    dsBgCtx.clearRect(0, 0, W, H);
                    var S = Math.min(100, th.s * 1.4), link = Math.max(110, Math.min(170, Math.min(W, H) * 0.14)), link2 = link * link;
                    var ps = s.ps;
                    for (var i = 0; i < ps.length; i++) {
                        var p = ps[i];
                        var dx = mouse.x - p.x, dy = mouse.y - p.y, d2 = dx * dx + dy * dy;
                        if (d2 < 48000 && d2 > 1) {
                            var d = Math.sqrt(d2), f = (d < 90 ? -1.2 : 0.3) / d;
                            p.vx += dx * f * 0.05 * dt; p.vy += dy * f * 0.05 * dt;
                        }
                        var sp = Math.hypot(p.vx, p.vy);
                        if (sp > 1.3) { p.vx *= 1.3 / sp; p.vy *= 1.3 / sp; }
                        if (sp < 0.15) { p.vx += rand(-0.05, 0.05); p.vy += rand(-0.05, 0.05); }
                        p.x += p.vx * dt; p.y += p.vy * dt; p.ph += 0.05 * dt;
                        if (p.x < 0 || p.x > W) { p.vx *= -1; p.x = Math.max(0, Math.min(W, p.x)); }
                        if (p.y < 0 || p.y > H) { p.vy *= -1; p.y = Math.max(0, Math.min(H, p.y)); }
                    }
                    var lines = [];
                    for (var q = 0; q < 6; q++) lines.push(new Path2D());
                    var add = function(a, x1, y1, x2, y2) { var l = lines[Math.min(5, Math.floor(a * 6))]; l.moveTo(x1, y1); l.lineTo(x2, y2); };
                    for (var i = 0; i < ps.length; i++) {
                        var a = ps[i];
                        for (var j = i + 1; j < ps.length; j++) {
                            var b = ps[j], ddx = a.x - b.x, ddy = a.y - b.y, dd2 = ddx * ddx + ddy * ddy;
                            if (dd2 < link2) add(0.45 * (1 - Math.sqrt(dd2) / link) / 0.7, a.x, a.y, b.x, b.y);
                        }
                        var mx = mouse.x - a.x, my = mouse.y - a.y, m2 = mx * mx + my * my;
                        if (m2 < link2 * 1.7) add(1 - Math.sqrt(m2 / (link2 * 1.7)), a.x, a.y, mouse.x, mouse.y);
                    }
                    dsBgCtx.strokeStyle = hsla(th.h, S, 75, 1);
                    dsBgCtx.lineWidth = 1;
                    lines.forEach(function(l, k) { dsBgCtx.globalAlpha = 0.7 * (k + 0.5) / 6; dsBgCtx.stroke(l); });
                    dsBgCtx.globalAlpha = 1;
                    var dots = new Path2D();
                    for (var i = 0; i < ps.length; i++) {
                        var p = ps[i];
                        var r = p.r * (0.85 + 0.15 * Math.sin(p.ph));
                        drawSprite('glow', p.x, p.y, r * 5, th.h, S, 70, 0.4);
                        dots.moveTo(p.x + r, p.y);
                        dots.arc(p.x, p.y, r, 0, Math.PI * 2);
                    }
                    dsBgCtx.fillStyle = hsla(th.h, S, 85, 1);
                    dsBgCtx.fill(dots);
                }
            },
            waves: {
                init: function() { return { time: rand(0, 50) }; },
                draw: function(s, dt, th) {
                    dsBgCtx.clearRect(0, 0, W, H);
                    s.time += 0.01 * dt;
                    var S = Math.min(100, th.s * 1.3), L = 75;
                    var k = Math.min(200, Math.max(80, H * 0.15)) / 100, mid = H * 0.5;
                    WAVES.forEach(function(c, w) {
                        dsBgCtx.beginPath();
                        for (var x = 0; x <= W; x += 3) {
                            var y = mid + (Math.sin(x * c.f1 + s.time * c.s1 + c.off) * c.a1 + Math.sin(x * c.f2 + s.time * c.s2 + c.off * 0.7) * c.a2 + Math.sin(x * c.f3 + s.time * c.s3 + c.off * 2) * c.a3) * k;
                            if (x) dsBgCtx.lineTo(x, y); else dsBgCtx.moveTo(x, y);
                        }
                        var color = hsla(th.h + c.dh, S, L + c.dl, 1);
                        var width = 2 + w * 0.5;
                        dsBgCtx.strokeStyle = color;
                        dsBgCtx.globalAlpha = c.al * 0.14;
                        dsBgCtx.lineWidth = width + 10 + w * 3;
                        dsBgCtx.stroke();
                        dsBgCtx.globalAlpha = c.al;
                        dsBgCtx.lineWidth = width;
                        dsBgCtx.stroke();
                    });
                    dsBgCtx.globalAlpha = 1;
                }
            },
            aurora: {
                init: function() { return { t: rand(0, 100) }; },
                draw: function(s, dt, th) {
                    dsBgCtx.clearRect(0, 0, W, H);
                    s.t += 0.012 * dt;
                    var S = Math.min(100, th.s * 1.15), step = 6;
                    dsBgCtx.globalCompositeOperation = 'lighter';
                    [{ base: 0.64, amp: 0.08, len: 0.3, dh: 0, a: 0.45, f: 0.0021, sp: 1 },
                     { base: 0.72, amp: 0.06, len: 0.24, dh: 45, a: 0.3, f: 0.0016, sp: -0.7 },
                     { base: 0.58, amp: 0.05, len: 0.2, dh: -40, a: 0.28, f: 0.0027, sp: 0.55 }].forEach(function(b) {
                        var img = sprite('curtain', th.h + b.dh, S, 60);
                        for (var x = 0; x < W; x += step) {
                            var y = H * (b.base + b.amp * Math.sin(x * b.f + s.t * b.sp) + 0.025 * Math.sin(x * b.f * 3.1 - s.t * 1.7 * b.sp));
                            var len = H * b.len * (0.6 + 0.4 * Math.sin(x * 0.011 + s.t * 2.3 * b.sp));
                            dsBgCtx.globalAlpha = b.a * (0.5 + 0.5 * Math.sin(x * 0.004 - s.t * 1.3 + b.dh));
                            dsBgCtx.drawImage(img, x, y - len, step + 1, len);
                        }
                    });
                    dsBgCtx.globalAlpha = 1;
                    dsBgCtx.globalCompositeOperation = 'source-over';
                }
            },
            bokeh: {
                init: function() {
                    var n = Math.min(45, Math.floor(W * H / 38000));
                    var b = [];
                    for (var i = 0; i < n; i++) b.push(this.spawn(rand(0, H)));
                    return { b: b };
                },
                spawn: function(y) {
                    var d = Math.random();
                    return { x: rand(0, W), y: y, d: d, r: 12 + d * 80, vy: -(0.12 + d * 0.45), ph: rand(0, 6.3), dh: rand(-30, 30), a: 0.5 - d * 0.28 };
                },
                draw: function(s, dt, th) {
                    dsBgCtx.clearRect(0, 0, W, H);
                    var S = Math.min(100, th.s * 1.2);
                    dsBgCtx.globalCompositeOperation = 'lighter';
                    var self = this;
                    s.b.forEach(function(p, i) {
                        p.y += p.vy * dt; p.ph += 0.02 * dt; p.x += Math.sin(p.ph) * 0.25 * dt;
                        if (p.y < -p.r) s.b[i] = self.spawn(H + p.r);
                        drawSprite('disc', p.x, p.y, p.r, th.h + p.dh, S, 62, p.a * (0.75 + 0.25 * Math.sin(p.ph * 1.7)));
                    });
                    dsBgCtx.globalCompositeOperation = 'source-over';
                }
            },
            grid: {
                init: function() { return { z: 0 }; },
                draw: function(s, dt, th) {
                    dsBgCtx.clearRect(0, 0, W, H);
                    s.z = (s.z + 0.012 * dt) % 1;
                    var hor = H * 0.6, S = Math.min(100, Math.max(th.s, 25) * 1.1), cx = W / 2;
                    var R = Math.min(W, H) * 0.18, cy = hor - R * 0.6;
                    drawSprite('glow', cx, cy, R * 2.4, th.h + 20, S, 60, 0.35);
                    var sun = dsBgCtx.createLinearGradient(0, cy - R, 0, cy + R);
                    sun.addColorStop(0, hsla(th.h + 45, S, 72, 0.95));
                    sun.addColorStop(1, hsla(th.h - 25, S, 55, 0.95));
                    dsBgCtx.fillStyle = sun;
                    dsBgCtx.beginPath(); dsBgCtx.arc(cx, cy, R, 0, Math.PI * 2); dsBgCtx.fill();
                    dsBgCtx.globalCompositeOperation = 'destination-out';
                    for (var i = 0; i < 6; i++) dsBgCtx.fillRect(cx - R, cy + R * (0.02 + i * 0.105), 2 * R, 1.5 + i * 1.2);
                    dsBgCtx.globalCompositeOperation = 'source-over';
                    dsBgCtx.clearRect(0, hor, W, H - hor);
                    var floor = dsBgCtx.createLinearGradient(0, hor, 0, H);
                    floor.addColorStop(0, hsla(th.h, S, 45, 0.22));
                    floor.addColorStop(1, hsla(th.h, S, 30, 0));
                    dsBgCtx.fillStyle = floor;
                    dsBgCtx.fillRect(0, hor, W, H - hor);
                    dsBgCtx.strokeStyle = hsla(th.h, S, 68, 1);
                    dsBgCtx.lineWidth = 1.2;
                    var n = 18;
                    for (var i = -n; i <= n; i++) {
                        dsBgCtx.globalAlpha = 0.55;
                        dsBgCtx.beginPath(); dsBgCtx.moveTo(cx + i * 6, hor); dsBgCtx.lineTo(cx + i * (W / n) * 1.4, H); dsBgCtx.stroke();
                    }
                    for (var i = 0; i < 18; i++) {
                        var d = i + 1 - s.z, y = hor + (H - hor) * 0.9 / d;
                        if (y > H) continue;
                        dsBgCtx.globalAlpha = Math.min(0.8, 1.2 / d);
                        dsBgCtx.beginPath(); dsBgCtx.moveTo(0, y); dsBgCtx.lineTo(W, y); dsBgCtx.stroke();
                    }
                    dsBgCtx.globalAlpha = 1;
                    dsBgCtx.lineWidth = 2;
                    dsBgCtx.strokeStyle = hsla(th.h + 20, S, 75, 0.9);
                    dsBgCtx.beginPath(); dsBgCtx.moveTo(0, hor); dsBgCtx.lineTo(W, hor); dsBgCtx.stroke();
                    var haze = dsBgCtx.createLinearGradient(0, hor, 0, hor + (H - hor) * 0.3);
                    haze.addColorStop(0, 'rgba(0,0,0,1)');
                    haze.addColorStop(1, 'rgba(0,0,0,0)');
                    dsBgCtx.globalCompositeOperation = 'destination-out';
                    dsBgCtx.fillStyle = haze;
                    dsBgCtx.fillRect(0, hor + 1, W, (H - hor) * 0.3);
                    dsBgCtx.globalCompositeOperation = 'source-over';
                }
            },
            snow: {
                init: function() {
                    var k = Math.min(2.2, Math.max(0.5, Math.sqrt(W * H / 196000)));
                    var mk = function(n, rmin, rmax, vmin, vmax, amax) {
                        var out = [];
                        for (var i = 0; i < Math.round(n * k); i++) {
                            var g = Math.floor(Math.random() * 4);
                            out.push({ x: rand(0, W), y: rand(0, H), r: rand(rmin, rmax), v: rand(vmin, vmax), g: g, a: amax * (0.6 + g * 0.4 / 3), ph: rand(0, 6.3) });
                        }
                        return out;
                    };
                    return { t: rand(0, 100), far: mk(150, 0.5, 1.1, 0.5, 0.9, 0.5), mid: mk(70, 1.2, 2.1, 1.1, 1.8, 0.7), near: mk(10, 9, 26, 2.2, 3.6, 0.2) };
                },
                draw: function(s, dt, th) {
                    dsBgCtx.clearRect(0, 0, W, H);
                    var u = dt * 3, S = th.s * 0.4;
                    s.t += 0.016 * u;
                    var gust = Math.pow(Math.max(0, Math.sin(s.t * 0.7)), 3), wind = 1.1 + Math.sin(s.t * 0.4) * 0.6 + gust * 3.2;
                    dsBgCtx.fillStyle = hsla(th.h, S, 92, 1);
                    [s.far, s.mid].forEach(function(arr, idx) {
                        var k = idx === 0 ? 0.5 : 1;
                        var packs = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
                        for (var i = 0; i < arr.length; i++) {
                            var p = arr[i];
                            var vx = wind * k * (0.7 + p.r * 0.2);
                            p.ph += 0.02 * u;
                            p.x += (vx + Math.sin(p.ph) * 0.2) * u; p.y += p.v * u;
                            if (p.y > H + 4) { p.y = -4; p.x = rand(0, W); }
                            if (p.x > W + 6) p.x = -6;
                            packs[p.g].moveTo(p.x + p.r * 0.8, p.y);
                            packs[p.g].arc(p.x, p.y, p.r * 0.8, 0, Math.PI * 2);
                        }
                        var am = idx === 0 ? 0.5 : 0.7;
                        packs.forEach(function(pack, g) { dsBgCtx.globalAlpha = am * (0.6 + g * 0.4 / 3); dsBgCtx.fill(pack); });
                    });
                    for (var i = 0; i < s.near.length; i++) {
                        var p = s.near[i];
                        p.ph += 0.01 * u;
                        p.x += (wind * 1.6 + Math.sin(p.ph) * 0.4) * u; p.y += p.v * u;
                        if (p.y > H + 30) { p.y = -30; p.x = rand(-20, W); }
                        if (p.x > W + 30) p.x = -30;
                        drawSprite('disc', p.x, p.y, p.r, th.h, S, 90, p.a);
                    }
                    dsBgCtx.globalAlpha = 1;
                }
            }
        };
        return {
            attach: function(c) { dsBgCtx = c; },
            size: function(w, h) { W = w; H = h; bgName = ''; },
            mouse: function(x, y) { mouse.x = x; mouse.y = y; },
            reset: function() { bgName = ''; },
            draw: function(cur, dt, th) {
                var def = BACKGROUNDS[cur];
                if (!def) return;
                if (bgName !== cur) { bgName = cur; dsBgCtx.clearRect(0, 0, W, H); bg = def.init(); }
                def.draw(bg, dt, th);
            }
        };
    }

    function dsBgTheme() {
        return { h: 270, s: 90 };
    }

    function dsBgInit() {
        if (dsBgCanvas) return;
        dsBgCanvas = document.createElement('canvas');
        dsBgCanvas.id = 'ds-bg-canvas';
        document.body.insertBefore(dsBgCanvas, document.body.firstChild);
        dsBgCtx = dsBgCanvas.getContext('2d');
        dsBgEngine = dsBgCreateEngine();
        dsBgEngine.attach(dsBgCtx);
        dsBgResize();
        window.addEventListener('resize', dsBgResize);
        dsBgCanvas.addEventListener('pointermove', function(e) { dsBgEngine.mouse(e.clientX, e.clientY); });
        document.addEventListener('mouseleave', function() { dsBgEngine.mouse(-1e4, -1e4); });
        dsBgLoop(0);
    }

    function dsBgResize() {
        if (!dsBgCanvas) return;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = innerWidth, h = innerHeight;
        dsBgCanvas.style.width = w + 'px';
        dsBgCanvas.style.height = h + 'px';
        dsBgCanvas.width = Math.round(w * dpr);
        dsBgCanvas.height = Math.round(h * dpr);
        if (dsBgCtx) dsBgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (dsBgEngine) { dsBgEngine.size(w, h); dsBgEngine.reset(); }
    }

    function dsBgLoop(now) {
        dsBgRaf = requestAnimationFrame(dsBgLoop);
        if (!dsBgCanvas || !dsBgCtx) return;
        if (dsBgCanvas.classList.contains('ds-bg-off')) return;
        var name = settings.bgAnim;
        if (!name || name === 'none') return;
        var dt = Math.min(3, (now - dsBgLast) / 50);
        dsBgLast = now;
        try { dsBgEngine.draw(name, dt, dsBgTheme()); } catch (e) { console.warn('ds bg error', e); }
    }

    function dsBgApply() {
        if (!dsBgCanvas) return;
        dsBgCanvas.classList.toggle('ds-bg-off', !settings.bgAnim || settings.bgAnim === 'none');
        dsBgCanvas.style.opacity = String(Math.max(0.05, Math.min(0.5, (settings.bgOpacity || 18) / 100)));
        if (settings.bgAnim && settings.bgAnim !== 'none' && dsBgEngine) { dsBgEngine.reset(); }
    }

    // === v2.4: кнопка «вверх» ===
    function ensureScrollTopBtn() {
        if (!settings.scrollBottom) {
            var b = document.getElementById('ds-scroll-top');
            if (b) b.remove();
            return;
        }
        var btn = document.getElementById('ds-scroll-top');
        if (!btn) {
            btn = document.createElement('div');
            btn.id = 'ds-scroll-top';
            btn.textContent = '↑';
            btn.title = 'К началу (вверх)';
            btn.onclick = function() {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                var els = document.querySelectorAll('main, [class*="chat-container"], [class*="conversation"], [class*="scroll"], [class*="message-list"], [class*="chat-content"], [class*="overflow"]');
                els.forEach(function(el) { if (el.scrollHeight > el.clientHeight + 50) el.scrollTo({ top: 0, behavior: 'smooth' }); });
            };
            document.body.appendChild(btn);
        }
        var scroller = (function() {
            var els = document.querySelectorAll('main, [class*="chat-container"], [class*="conversation"], [class*="scroll"], [class*="message-list"], [class*="chat-content"], [class*="overflow"]');
            var best = null, bestH = 0;
            els.forEach(function(el) { if (el.scrollHeight > el.clientHeight + 50 && el.scrollHeight > bestH) { best = el; bestH = el.scrollHeight; } });
            return best || window;
        })();
        var isFar;
        if (scroller === window) isFar = window.scrollY > 300;
        else isFar = scroller.scrollTop > 300;
        btn.classList.toggle('ds-show', isFar);
    }

    // === v2.4: тосты ===
    function dsToast(title, sub, kind) {
        var box = document.querySelector('.ds-toasts');
        if (!box) {
            box = document.createElement('div');
            box.className = 'ds-toasts';
            document.body.appendChild(box);
        }
        var old = box.querySelectorAll('.ds-toast:not(.ds-toast-out)');
        old.forEach(function(t) { t.classList.add('ds-toast-out'); setTimeout(function() { t.remove(); }, 250); });
        var t = document.createElement('div');
        t.className = 'ds-toast' + (kind === 'ok' ? ' ds-toast-ok' : kind === 'err' ? ' ds-toast-err' : '');
        var icon = kind === 'ok' ? '✅' : kind === 'err' ? '❌' : 'ℹ️';
        t.innerHTML = '<span class="ds-toast-icon"></span><span class="ds-toast-body"><span class="ds-toast-title"></span>' + (sub ? '<span class="ds-toast-sub"></span>' : '') + '</span>';
        t.querySelector('.ds-toast-icon').textContent = icon;
        t.querySelector('.ds-toast-title').textContent = title;
        if (sub) t.querySelector('.ds-toast-sub').textContent = sub;
        t.addEventListener('click', function() { t.classList.add('ds-toast-out'); setTimeout(function() { t.remove(); }, 250); });
        box.appendChild(t);
        setTimeout(function() { if (t.isConnected) { t.classList.add('ds-toast-out'); setTimeout(function() { t.remove(); }, 250); } }, 4000);
    }

    function init() {
        // Защита от старой версии: если фича выключена, а элемент в DOM остался
        // от прошлой загрузки — убираем сразу, не ждём тика.
        if (!settings.scrollBottom) {
            const b = document.getElementById('ds-scroll-bottom');
            if (b) b.remove();
        }
        if (!settings.charCounter) {
            const c = document.getElementById('ds-char-counter');
            if (c) c.remove();
        }
        if (!settings.copyCode) {
            document.querySelectorAll('.ds-code-wrap').forEach(wrap => {
                const pre = wrap.querySelector('pre');
                if (pre) wrap.parentNode.insertBefore(pre, wrap);
                wrap.remove();
            });
        }

        applyStyles();
        createPanel();
        injectHeaderButtons();
        if (typeof dsBgInit === 'function') { dsBgInit(); dsBgApply(); }
        if (typeof showSplash === 'function') showSplash();
        if (typeof injectUpdateButton === 'function') {
            // сброс кэша при старте, чтобы проверить GitHub заново (а не ждать 15 минут)
            localStorage.removeItem('ds_update_at');
            injectUpdateButton();
        }
        
        setInterval(() => {
            if (!document.getElementById('ds-header-tools')) {
                injectHeaderButtons();
            }
            hideAiNote();
            processThoughts();
            processCodeBlocks();
            ensureScrollBtn();
            updateCharCounter();
            enforceToggles();
            hideNativeScroll();
            applySmartWide();
            applyBranding();
            ensureEmojiButton();
            ensureScrollTopBtn();
            injectUpdateButton();
            if (typeof dsCheckUpdate === 'function' && !window._dsUpdChecked) { window._dsUpdChecked = true; dsCheckUpdate(); }
        }, 1000);
        
        if (settings.autoGrow) {
            const observer = new MutationObserver(() => {
                const ta = document.querySelector('textarea');
                if (ta && !ta.dataset.autoGrow) {
                    ta.dataset.autoGrow = '1';
                    ta.addEventListener('input', function() {
                        this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px';
                    });
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        if (settings.hotkeys) {
            document.addEventListener('keydown', (e) => {
                // Ctrl+F — открыть свой поиск (перехватываем браузерный)
                if (e.ctrlKey && e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey) {
                    var active = document.activeElement;
                    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) return;
                    e.preventDefault();
                    openSearch();
                    return;
                }
                const ta = document.activeElement;
                if (ta && ta.tagName === 'TEXTAREA') {
                    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
                        e.preventDefault();
                        const start = ta.selectionStart; const end = ta.selectionEnd;
                        ta.value = ta.value.substring(0, start) + '\n' + ta.value.substring(end);
                        ta.selectionStart = ta.selectionEnd = start + 1;
                    }
                    if (e.key === 'Enter' && e.ctrlKey) {
                        e.preventDefault();
                        const sendBtn = document.querySelector('button[type="submit"], button[aria-label*="Send"]');
                        if (sendBtn) sendBtn.click();
                    }
                }
            }, true);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
