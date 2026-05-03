let floatingBtn = null;
let isFloatingButtonEnabled = true;
let isExtensionValid = true; // 拡張機能が有効かどうかを追跡するフラグ

// 初回読み込み時に設定を取得してローカル変数に保持（毎回取得するとエラーや遅延の原因になるため）
try {
  chrome.storage.local.get({ enable_floating_button: true }, (items) => {
    if (!chrome.runtime.lastError) isFloatingButtonEnabled = items.enable_floating_button;
  });
  
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enable_floating_button) {
      isFloatingButtonEnabled = changes.enable_floating_button.newValue;
    }
  });
} catch (err) {
  isExtensionValid = false;
}

function createButton() {
  const container = document.createElement('div');
  container.id = 'pollychrome-floating-container';

  const btnGroup = document.createElement('div');
  btnGroup.className = 'pollychrome-btn-group';

  const btnSpeak = document.createElement('div');
  btnSpeak.id = 'pollychrome-floating-btn';
  btnSpeak.textContent = '🔊 読み上げ';

  const btnTranslate = document.createElement('div');
  btnTranslate.id = 'pollychrome-translate-btn';
  btnTranslate.textContent = '📖 辞書/翻訳';

  const btnSettings = document.createElement('div');
  btnSettings.id = 'pollychrome-settings-btn';
  btnSettings.textContent = '⚙️ 設定';

  const tooltip = document.createElement('div');
  tooltip.id = 'pollychrome-tooltip';

  btnSpeak.addEventListener('mousedown', (e) => {
    e.preventDefault(); // 選択解除を防止
    const text = window.getSelection().toString().trim();
    if (text && isExtensionValid) {
      try {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          const p = chrome.runtime.sendMessage({ action: "speak_text", text: text });
          if (p && typeof p.catch === 'function') p.catch(() => { isExtensionValid = false; });
        }
      } catch (err) {
        isExtensionValid = false;
        console.warn("PollyChrome: Extension updated. Please reload the page (F5) to use the extension.");
      }
    }
    removeButton();
  });

  btnTranslate.addEventListener('mousedown', (e) => {
    e.preventDefault(); // 選択解除を防止
    const text = window.getSelection().toString().trim();
    if (text && isExtensionValid) {
      tooltip.style.display = 'block';
      tooltip.textContent = '翻訳中...';
      
      // ツールチップが画面右側にはみ出す場合は、ボタンの左側に向かって広がるように調整
      tooltip.style.left = '0';
      tooltip.style.right = 'auto';
      const rect = tooltip.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        tooltip.style.left = 'auto';
        tooltip.style.right = '0';
      }

      try {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: "translate_text", text: text }, (response) => {
            if (chrome.runtime.lastError) {
              tooltip.textContent = 'エラーが発生しました';
            } else if (response && response.error) {
              tooltip.textContent = response.error;
            } else if (response && response.translated_text) {
              tooltip.textContent = ''; // 中身をクリア
              
              const transDiv = document.createElement('div');
              transDiv.style.whiteSpace = 'pre-wrap';
              transDiv.textContent = response.translated_text.replace(/。/g, '。\n');
              tooltip.appendChild(transDiv);
              
              if (response.word_meanings && response.word_meanings.length > 0) {
                const hr = document.createElement('hr');
                hr.style.cssText = 'margin:5px 0; border:none; border-top:1px solid #ddd;';
                tooltip.appendChild(hr);
                
                const meaningsDiv = document.createElement('div');
                meaningsDiv.style.cssText = 'font-size:22px; color:#555; white-space:pre-wrap;';
                meaningsDiv.textContent = response.word_meanings.join('\n');
                tooltip.appendChild(meaningsDiv);
              }

              const estimatedCost = response.estimated_cost ? response.estimated_cost.toFixed(3) : "0.000";
              const costDiv = document.createElement('div');
              costDiv.style.cssText = 'font-size:10px; color:#999; text-align:right; margin-top:5px;';
              costDiv.textContent = `予想コスト: 約${estimatedCost}円`;
              tooltip.appendChild(costDiv);
            } else {
              tooltip.textContent = '翻訳できませんでした';
            }
          });
        }
      } catch (err) {
        tooltip.textContent = 'エラーが発生しました';
      }
    }
  });

  btnSettings.addEventListener('mousedown', (e) => {
    e.preventDefault(); // 選択解除を防止
    if (isExtensionValid) {
      try {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: "open_options_page" });
        }
      } catch (err) {
        isExtensionValid = false;
        console.warn("PollyChrome: Extension updated. Please reload the page (F5) to use the extension.");
      }
    }
    removeButton();
  });

  btnGroup.appendChild(btnSpeak);
  btnGroup.appendChild(btnTranslate);
  btnGroup.appendChild(btnSettings);
  container.appendChild(btnGroup);
  container.appendChild(tooltip);

  return container;
}

function removeButton() {
  if (floatingBtn && floatingBtn.parentNode) {
    floatingBtn.parentNode.removeChild(floatingBtn);
    floatingBtn = null;
  }
}

document.addEventListener('mouseup', (e) => {
  // イベント発生時のマウス座標を取得しておく
  const mouseX = e.pageX;
  const mouseY = e.pageY;

  setTimeout(() => {
    if (!isExtensionValid) return; // 拡張機能が無効な場合は何もしない

    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length > 0) {
      if (isFloatingButtonEnabled) {
        if (!floatingBtn) {
          floatingBtn = createButton();
          document.body.appendChild(floatingBtn);
        }
        let leftPos = mouseX + 10; // カーソルから少し右にずらす
        let topPos = mouseY + 15;  // カーソルから少し下にずらす
        
        // ボタン群(約320px)が画面右側にはみ出さないように位置を調整
        const estimatedBtnWidth = 320;
        const maxLeftPos = window.scrollX + window.innerWidth - estimatedBtnWidth - 20;
        
        if (leftPos > maxLeftPos) {
          leftPos = maxLeftPos;
        }
        if (leftPos < window.scrollX + 10) {
          leftPos = window.scrollX + 10;
        }

        floatingBtn.style.top = `${topPos}px`;
        floatingBtn.style.left = `${leftPos}px`;
      }
    } else {
      removeButton();
    }
  }, 10);
});

document.addEventListener('mousedown', (e) => {
  if (floatingBtn && !floatingBtn.contains(e.target)) removeButton();
});

try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "speak_selection") {
      const text = window.getSelection().toString().trim();
      if (text && isExtensionValid) {
        try {
          if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
            const p = chrome.runtime.sendMessage({ action: "speak_text", text: text });
            if (p && typeof p.catch === 'function') p.catch(() => { isExtensionValid = false; });
          }
        } catch (err) { isExtensionValid = false; }
      }
    }
  });
} catch (err) { isExtensionValid = false; }