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
      try {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: "translate_text", text: text }, (response) => {
            if (chrome.runtime.lastError) {
              tooltip.textContent = 'エラーが発生しました';
            } else if (response && response.translated_text) {
              let html = `<div>${response.translated_text.replace(/。/g, '。<br>')}</div>`;
              if (response.word_meanings && response.word_meanings.length > 0) {
                html += `<hr style="margin:5px 0; border:none; border-top:1px solid #ddd;"><div style="font-size:11px; color:#555;">${response.word_meanings.join('<br>')}</div>`;
              }
              tooltip.innerHTML = html;
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

  btnGroup.appendChild(btnSpeak);
  btnGroup.appendChild(btnTranslate);
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
        const range = selection.getRangeAt(0).getBoundingClientRect();
        floatingBtn.style.top = `${window.scrollY + range.bottom + 5}px`;
        floatingBtn.style.left = `${window.scrollX + range.left + (range.width / 2) - 40}px`;
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