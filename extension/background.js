import { CONFIG } from './config.js';

// 拡張機能アイコンがクリックされたらオプション画面を開く
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

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
                  if (window.pollychromeAudio.defaultPlaybackRate) window.pollychromeAudio.playbackRate = window.pollychromeAudio.defaultPlaybackRate;
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
  } else if (request.action === "open_options_page") {
    chrome.runtime.openOptionsPage();
  }
});

// JSONファイルからデフォルトのストップワードを取得する
async function getDefaultStopWords() {
  const response = await fetch(chrome.runtime.getURL('stop_words.json'));
  const stopWordsArray = await response.json();
  return stopWordsArray.join(", ");
}

// JSONファイルからデフォルトのAWS用語を取得する
async function getDefaultAwsTerms() {
  const response = await fetch(chrome.runtime.getURL('aws_terms.json'));
  const termsArray = await response.json();
  return termsArray.join(", ");
}

// APIを呼び出して音声を再生する関数
async function speakText(text, tabId) {
  try {
    if (text.length > 5000) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (len) => alert(`🚨 文字数が多すぎます！（上限5,000文字）\n現在の文字数: ${len}文字\nテキストを短くして再度お試しください。`),
        args: [text.length]
      });
      return;
    }

    const defaultStopWords = await getDefaultStopWords();
    const defaultAwsTerms = await getDefaultAwsTerms();
    const settings = await chrome.storage.local.get({ voice_type_ja: 'Mizuki', voice_type_en: 'Joanna', speech_rate: '1.0', enable_audio: true, enable_subtitle: true, enable_highlight: true, stop_words: defaultStopWords, aws_terms: defaultAwsTerms, usd_rate: 150 });

    // 音声も字幕も無効な場合は、APIを呼び出さずに終了
    if (!settings.enable_audio && !settings.enable_subtitle) {
      return;
    }

    const combinedStopWords = (settings.stop_words || "") + ", " + (settings.aws_terms || "");
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.API_KEY
      },
      body: JSON.stringify({ text: text, voice_type_ja: settings.voice_type_ja, voice_type_en: settings.voice_type_en, stop_words: combinedStopWords, enable_subtitle: settings.enable_subtitle, enable_highlight: settings.enable_highlight, usd_rate: settings.usd_rate })
    });

    if (!response.ok) {
      if (response.status === 429) {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => alert("🚨 APIの利用制限に達しました。\nしばらく待ってから再度お試しください。")
        });
        return;
      }
      throw new Error(`API Request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    const estimatedCost = data.estimated_cost || 0;

    // Base64で受け取った音声をアクティブなタブ（ページ）内で再生
    if (data.audio) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (base64Audio, rate, translatedText, enableAudio, enableSubtitle, enableHighlight, estimatedCost, speechMarks, originalText) => {
          // すでに再生中の音声があれば停止する（音の重なり防止）
          if (window.pollychromeAudio) {
            window.pollychromeAudio.pause();
            window.pollychromeAudio = null;
          }

          let audio = null;
          if (enableAudio && base64Audio) {
            audio = new Audio("data:audio/mp3;base64," + base64Audio);
            audio.defaultPlaybackRate = rate; // デフォルトの速度として記憶させる
            audio.playbackRate = rate;
            window.pollychromeAudio = audio;
            audio.play().then(() => {
              audio.playbackRate = rate; // Chromeの仕様対策: 再生開始直後に再度上書きする
            }).catch((err) => {
              console.error("PollyChrome Audio Play Error:", err);
              alert("🔊 Chromeのセキュリティにより音声の再生がブロックされました！\nウェブページのどこか適当な場所を一度クリックしてから、再度読み上げを実行してください。");
            });
          }

          // 字幕パネルを作成（または取得）
          let subtitlePanel = document.getElementById('pollychrome-subtitle');
          if ((enableSubtitle && translatedText) || (enableAudio && enableHighlight && speechMarks.length > 0)) {
            if (!subtitlePanel) {
              subtitlePanel = document.createElement('div');
              subtitlePanel.id = 'pollychrome-subtitle';
              subtitlePanel.style.cssText = 'position:fixed; bottom:70px; left:50%; transform:translateX(-50%); z-index:2147483647; background:rgba(0,0,0,0.8); color:#fff; padding:15px 20px; border-radius:8px; font-size:32px; font-family:sans-serif; line-height:1.5; width:90vw; max-width:95vw; max-height:50vh; overflow-y:auto; text-align:left; box-shadow:0 4px 6px rgba(0,0,0,0.3);';
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
            subtitlePanel.textContent = ''; // 中身をリセット

            // 読み上げ中の原文ハイライト（プロンプター）要素
            let originalTextDiv = null;
            if (enableHighlight && originalText) {
              originalTextDiv = document.createElement('div');
              originalTextDiv.style.cssText = 'font-size: 32px; color: #ddd; margin-bottom: 10px; white-space: pre-wrap; line-height: 1.4;';
              originalTextDiv.textContent = originalText;
              subtitlePanel.appendChild(originalTextDiv);
            }

            // 翻訳字幕要素
            if (enableSubtitle && translatedText) {
              let transDiv = document.createElement('div');
              transDiv.style.cssText = 'font-size: 32px; white-space: pre-wrap; border-top: 1px solid #555; padding-top: 10px;';
              transDiv.textContent = translatedText.replace(/。/g, '。\n');
              subtitlePanel.appendChild(transDiv);
            }

            // 音声再生に合わせてハイライトを更新
            if (enableHighlight && audio && speechMarks.length > 0 && originalTextDiv) {
              const escapeHTML = (str) => str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
              const encoder = new TextEncoder();
              const decoder = new TextDecoder('utf-8');
              const originalBytes = encoder.encode(originalText);
              
              audio.addEventListener('timeupdate', () => {
                const currentTimeMs = audio.currentTime * 1000;
                let currentMark = null;
                for (let i = speechMarks.length - 1; i >= 0; i--) {
                  if (currentTimeMs >= speechMarks[i].time) {
                    currentMark = speechMarks[i];
                    break;
                  }
                }
                if (currentMark) {
                  // Pollyのstart/endは「バイトオフセット」なので文字インデックスに変換する
                  const startCharIdx = decoder.decode(originalBytes.slice(0, currentMark.start)).length;
                  const endCharIdx = decoder.decode(originalBytes.slice(0, currentMark.end)).length;
                  
                  const before = escapeHTML(originalText.substring(0, startCharIdx));
                  const highlight = escapeHTML(originalText.substring(startCharIdx, endCharIdx));
                  const after = escapeHTML(originalText.substring(endCharIdx));
                  originalTextDiv.innerHTML = `${before}<span style="background-color: #007bff; color: #fff; border-radius: 3px; padding: 0 4px;">${highlight}</span>${after}`;
                }
              });
            }

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
            ctrlPanel.textContent = ''; // 中身をリセット

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

              const downloadBtn = document.createElement('div');
              downloadBtn.textContent = '💾 保存';
              downloadBtn.style.cssText = 'background:#5cb85c; color:#fff; padding:5px 10px; border-radius:3px; font-size:13px; font-family:sans-serif; cursor:pointer; user-select:none;';

              ctrlPanel.appendChild(stopBtn);
              ctrlPanel.appendChild(replayBtn);
              ctrlPanel.appendChild(downloadBtn);

              downloadBtn.addEventListener('click', () => {
                // Base64をバイナリデータ(Blob)に変換して安全にダウンロードさせる
                const byteCharacters = atob(base64Audio);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'audio/mp3' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `pollychrome_${new Date().getTime()}.mp3`; // 現在時刻を使ったファイル名
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              });

              stopBtn.addEventListener('click', () => {
                if (audio) audio.pause();
                stopBtn.style.display = 'none';
                replayBtn.style.display = 'block';
              });

              replayBtn.addEventListener('click', () => {
                if (audio) {
                  audio.currentTime = 0;
                  audio.playbackRate = rate; // 再再生時にも速度を適用
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
            
            const costInfo = document.createElement('div');
            costInfo.textContent = `予想コスト: 約${estimatedCost.toFixed(3)}円`;
            costInfo.style.cssText = 'color:#ccc; font-size:11px; margin-left:auto; align-self:center; user-select:none;';
            ctrlPanel.appendChild(costInfo);

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
        args: [data.audio, parseFloat(settings.speech_rate), data.translated_text || null, settings.enable_audio, settings.enable_subtitle, settings.enable_highlight, estimatedCost, data.speech_marks || [], text]
      });
    }
  } catch (error) {
    console.error("PollyChrome Error:", error);
  }
}

// 翻訳のみを行う関数（音声合成をスキップ）
async function translateOnly(text) {
  try {
    if (text.length > 5000) {
      return { error: `文字数が多すぎます（上限5,000文字 / 現在${text.length}文字）。テキストを短くしてください。` };
    }

    const defaultStopWords = await getDefaultStopWords();
    const defaultAwsTerms = await getDefaultAwsTerms();
    const settings = await chrome.storage.local.get({ stop_words: defaultStopWords, aws_terms: defaultAwsTerms, usd_rate: 150 });

    const combinedStopWords = (settings.stop_words || "") + ", " + (settings.aws_terms || "");
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CONFIG.API_KEY },
      body: JSON.stringify({ text: text, translate_only: true, stop_words: combinedStopWords, usd_rate: settings.usd_rate })
    });
    if (!response.ok) {
      if (response.status === 429) {
        return { error: "APIの利用制限に達しました。しばらく待ってからお試しください。" };
      }
      throw new Error(`API Request failed with status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("PollyChrome Translate Error:", error);
    return { error: error.message };
  }
}