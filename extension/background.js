import { CONFIG } from './config.js';

// 拡張機能インストール時に右クリックメニューを作成
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pollychrome-speak",
    title: "Pollyで読み上げ",
    contexts: ["selection"]
  });
});

// 右クリックメニューがクリックされた時の処理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pollychrome-speak" && info.selectionText) {
    speakText(info.selectionText, tab.id);
  }
});

// ショートカットキーが押された時の処理
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      if (command === "speak_selection") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "speak_selection" });
      } else if (command === "stop_audio" || command === "replay_audio") {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (cmd) => {
            if (window.pollychromeAudio) {
              const ctrlPanel = document.getElementById('pollychrome-audio-ctrl');
              if (ctrlPanel) {
                const stopBtn = ctrlPanel.children[0];
                const replayBtn = ctrlPanel.children[1];
                
                if (cmd === "stop_audio" && stopBtn.style.display !== 'none') {
                  stopBtn.click();
                } else if (cmd === "replay_audio" && replayBtn.style.display !== 'none') {
                  replayBtn.click();
                } else if (cmd === "replay_audio") {
                  // 再生中や停止中に強制リプレイする場合
                  window.pollychromeAudio.currentTime = 0;
                  window.pollychromeAudio.play();
                } else if (cmd === "stop_audio") {
                  window.pollychromeAudio.pause();
                }
              }
            }
          },
          args: [command]
        });
      }
    }
  });
});

// コンテンツスクリプト(フローティングボタン等)からのメッセージを受信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "speak_text" && request.text) {
    speakText(request.text, sender.tab.id);
  } else if (request.action === "translate_text" && request.text) {
    translateOnly(request.text).then(sendResponse);
    return true; // 非同期でレスポンスを返すために true を指定
  }
});

// APIを呼び出して音声を再生する関数
async function speakText(text, tabId) {
  try {
    const settings = await chrome.storage.sync.get({ voice_type_ja: 'Mizuki', voice_type_en: 'Joanna', speech_rate: '1.0', enable_audio: true, enable_subtitle: true });

    // 音声も字幕も無効な場合は、APIを呼び出さずに終了
    if (!settings.enable_audio && !settings.enable_subtitle) {
      return;
    }

    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.API_KEY
      },
      body: JSON.stringify({ text: text, voice_type_ja: settings.voice_type_ja, voice_type_en: settings.voice_type_en })
    });

    if (!response.ok) {
      throw new Error(`API Request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    // Base64で受け取った音声をアクティブなタブ（ページ）内で再生
    if (data.audio) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (base64Audio, rate, translatedText, enableAudio, enableSubtitle) => {
          // すでに再生中の音声があれば停止する（音の重なり防止）
          if (window.pollychromeAudio) {
            window.pollychromeAudio.pause();
            window.pollychromeAudio = null;
          }

          let audio = null;
          if (enableAudio && base64Audio) {
            audio = new Audio("data:audio/mp3;base64," + base64Audio);
            audio.playbackRate = rate;
            window.pollychromeAudio = audio;
            audio.play();
          }

          // 字幕パネルを作成（または取得）
          let subtitlePanel = document.getElementById('pollychrome-subtitle');
          if (enableSubtitle && translatedText) {
            if (!subtitlePanel) {
              subtitlePanel = document.createElement('div');
              subtitlePanel.id = 'pollychrome-subtitle';
              subtitlePanel.style.cssText = 'position:fixed; bottom:70px; left:50%; transform:translateX(-50%); z-index:2147483647; background:rgba(0,0,0,0.8); color:#fff; padding:15px 20px; border-radius:8px; font-size:16px; font-family:sans-serif; line-height:1.5; max-width:80%; text-align:center; box-shadow:0 4px 6px rgba(0,0,0,0.3); pointer-events:none;';
              document.body.appendChild(subtitlePanel);

              // 選択解除で字幕を消す
              document.addEventListener('selectionchange', () => {
                const selText = window.getSelection().toString().trim();
                const panel = document.getElementById('pollychrome-subtitle');
                if (!selText && panel && panel.style.display !== 'none') {
                  panel.style.display = 'none';
                }
              });
            }
            subtitlePanel.textContent = translatedText;
            subtitlePanel.style.display = 'block';
          } else if (subtitlePanel) {
            subtitlePanel.style.display = 'none';
          }

          // コントロールパネルを作成（または取得）
          let ctrlPanel = document.getElementById('pollychrome-audio-ctrl');
          if (enableAudio || (enableSubtitle && translatedText)) {
            if (!ctrlPanel) {
              ctrlPanel = document.createElement('div');
              ctrlPanel.id = 'pollychrome-audio-ctrl';
              ctrlPanel.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:2147483647; display:flex; gap:10px; background:#333; padding:10px; border-radius:5px; box-shadow:0 2px 5px rgba(0,0,0,0.3);';
              document.body.appendChild(ctrlPanel);
            }
            ctrlPanel.style.display = 'flex';
            ctrlPanel.innerHTML = ''; // 中身をリセット

            const closeBtn = document.createElement('div');
            closeBtn.textContent = '✖ 閉じる';
            closeBtn.style.cssText = 'background:#777; color:#fff; padding:5px 10px; border-radius:3px; font-size:13px; font-family:sans-serif; cursor:pointer; user-select:none;';

            if (enableAudio && base64Audio) {
              const stopBtn = document.createElement('div');
              stopBtn.textContent = '⏹ 停止';
              stopBtn.style.cssText = 'background:#d9534f; color:#fff; padding:5px 10px; border-radius:3px; font-size:13px; font-family:sans-serif; cursor:pointer; user-select:none;';

              const replayBtn = document.createElement('div');
              replayBtn.textContent = '🔄 もう一度再生';
              replayBtn.style.cssText = 'background:#5bc0de; color:#fff; padding:5px 10px; border-radius:3px; font-size:13px; font-family:sans-serif; cursor:pointer; user-select:none; display:none;';

              ctrlPanel.appendChild(stopBtn);
              ctrlPanel.appendChild(replayBtn);

              stopBtn.addEventListener('click', () => {
                if (audio) audio.pause();
                stopBtn.style.display = 'none';
                replayBtn.style.display = 'block';
              });

              replayBtn.addEventListener('click', () => {
                if (audio) {
                  audio.currentTime = 0;
                  audio.play();
                }
                replayBtn.style.display = 'none';
                stopBtn.style.display = 'block';
                if (enableSubtitle && translatedText) {
                  if (subtitlePanel) subtitlePanel.style.display = 'block';
                }
              });

              audio.onended = () => {
                stopBtn.style.display = 'none';
                replayBtn.style.display = 'block';
              };
            }

            ctrlPanel.appendChild(closeBtn);

            closeBtn.addEventListener('click', () => {
              if (audio) audio.pause();
              ctrlPanel.style.display = 'none';
              if (subtitlePanel) subtitlePanel.style.display = 'none';
            });
          } else if (ctrlPanel) {
            ctrlPanel.style.display = 'none';
          }
        },
        args: [data.audio, parseFloat(settings.speech_rate), data.translated_text || null, settings.enable_audio, settings.enable_subtitle]
      });
    }
  } catch (error) {
    console.error("PollyChrome Error:", error);
  }
}

// 翻訳のみを行う関数（音声合成をスキップ）
async function translateOnly(text) {
  try {
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CONFIG.API_KEY },
      body: JSON.stringify({ text: text, translate_only: true })
    });
    if (!response.ok) throw new Error(`API Request failed with status ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("PollyChrome Translate Error:", error);
    return { error: error.message };
  }
}