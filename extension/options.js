document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('speech_rate').addEventListener('input', (e) => {
  document.getElementById('speed_value').textContent = parseFloat(e.target.value).toFixed(1);
});
document.getElementById('reset_stop_words').addEventListener('click', async (e) => {
  const response = await fetch(chrome.runtime.getURL('stop_words.json'));
  const stopWordsArray = await response.json();
  document.getElementById('stop_words').value = stopWordsArray.join(", ");
});
document.getElementById('open_shortcuts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

function save_options() {
  chrome.storage.local.set({
    enable_floating_button: document.getElementById('enable_floating_button').checked,
    enable_audio: document.getElementById('enable_audio').checked,
    enable_subtitle: document.getElementById('enable_subtitle').checked,
    voice_type_ja: document.getElementById('voice_type_ja').value,
    voice_type_en: document.getElementById('voice_type_en').value,
    speech_rate: document.getElementById('speech_rate').value,
    stop_words: document.getElementById('stop_words').value
  }, () => {
    const status = document.getElementById('status');
    status.textContent = '保存しました。';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
}

async function restore_options() {
  const response = await fetch(chrome.runtime.getURL('stop_words.json'));
  const stopWordsArray = await response.json();
  const defaultStopWords = stopWordsArray.join(", ");

  chrome.storage.local.get({ enable_floating_button: true, enable_audio: true, enable_subtitle: true, voice_type_ja: 'Mizuki', voice_type_en: 'Joanna', speech_rate: '1.0', stop_words: defaultStopWords }, (items) => {
    document.getElementById('enable_floating_button').checked = items.enable_floating_button;
    document.getElementById('enable_audio').checked = items.enable_audio;
    document.getElementById('enable_subtitle').checked = items.enable_subtitle;
    document.getElementById('voice_type_ja').value = items.voice_type_ja;
    document.getElementById('voice_type_en').value = items.voice_type_en;
    document.getElementById('speech_rate').value = items.speech_rate;
    document.getElementById('speed_value').textContent = parseFloat(items.speech_rate).toFixed(1);
    document.getElementById('stop_words').value = items.stop_words;
  });
}