import json
import base64
import boto3
import logging
import re

logger = logging.getLogger()
logger.setLevel(logging.INFO)

polly_client = boto3.client('polly')

def lambda_handler(event, context):
    try:
        # API Gatewayのプロキシ統合からのイベントボディを取得
        body = event.get('body')
        if not body:
            return _build_response(400, {'error': 'Request body is missing'})
        
        # bodyが文字列（JSON）の場合はパースする
        if isinstance(body, str):
            body = json.loads(body)
            
        text = body.get('text')
        if not text or not text.strip():
            return _build_response(400, {'error': 'Text is missing or empty'})
            
        logger.info(f"Text to synthesize: {text[:50]}...")
            
        # 辞書・翻訳のみのモードかチェック
        translate_only = body.get('translate_only', False)
        if translate_only:
            try:
                translate_client = boto3.client('translate')
                translate_response = translate_client.translate_text(
                    Text=text,
                    SourceLanguageCode='auto',
                    TargetLanguageCode='ja'
                )
                translated_text = translate_response.get('TranslatedText')
                
                # 英単語ごとの意味も取得する
                word_meanings = []
                
                # 除外する簡単な英単語（ストップワード）のリスト
                custom_stop_words_str = body.get('stop_words')
                stop_words = set()
                if custom_stop_words_str:
                    # フロントエンドから送られたストップワードを解析
                    stop_words = set(re.findall(r'\b[a-zA-Z]+\b', custom_stop_words_str.lower()))
                words = re.findall(r'\b[a-zA-Z]{2,}\b', text) # 2文字以上の英単語を抽出
                
                # 活用形を考慮してストップワードか判定するヘルパー関数
                def is_stop_word(w):
                    if w in stop_words: return True
                    if len(w) <= 3: return False # 短すぎる単語（bedなど）は活用形とみなさない
                    
                    bases = []
                    # -s, -es, -ies の処理 (ただし ss で終わる business などは除外)
                    if w.endswith('ies'): bases.extend([w[:-3] + 'y', w[:-2]])
                    elif w.endswith('es'): bases.extend([w[:-1], w[:-2]])
                    elif w.endswith('s') and not w.endswith('ss'): bases.append(w[:-1])
                    
                    # -ed, -ied の処理 (重なった子音 stopped -> stop も考慮)
                    if w.endswith('ied'): bases.append(w[:-3] + 'y')
                    elif w.endswith('ed'): bases.extend([w[:-1], w[:-2], w[:-3] if len(w) >= 4 and w[-3] == w[-4] else ''])
                    
                    # -ing の処理 (making -> make, running -> run)
                    if w.endswith('ing'): bases.extend([w[:-3], w[:-3] + 'e', w[:-4] if len(w) >= 5 and w[-4] == w[-5] else ''])
                    
                    return any(b in stop_words for b in bases if b)

                unique_words = []
                for w in words:
                    wl = w.lower()
                    if wl not in unique_words and not is_stop_word(wl):
                        unique_words.append(wl)
                        
                # 長文の場合は、抽出した単語を最初の20個までに制限
                unique_words = unique_words[:20]

                # 単語の意味をまとめて翻訳
                if len(unique_words) > 0:
                    words_text = "\n".join(unique_words)
                    words_response = translate_client.translate_text(
                        Text=words_text,
                        SourceLanguageCode='en',
                        TargetLanguageCode='ja'
                    )
                    words_translated = [w.strip() for w in words_response.get('TranslatedText').split('\n') if w.strip()]
                    for i, w in enumerate(unique_words):
                        if i < len(words_translated):
                            word_meanings.append(f"{w}: {words_translated[i]}")

                response_data = {'translated_text': translated_text}
                if word_meanings:
                    response_data['word_meanings'] = word_meanings

                return _build_response(200, response_data)
            except Exception as e:
                logger.error(f"Translate Error: {str(e)}")
                return _build_response(500, {'error': 'Translation failed'})

        voice_type_ja = body.get('voice_type_ja', 'Mizuki')
        voice_type_en = body.get('voice_type_en', 'Joanna')

        # テキストに日本語（ひらがな、カタカナ、漢字）が含まれているか判定
        is_japanese = bool(re.search(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]', text))

        voice_id = voice_type_ja if is_japanese else voice_type_en
        
        logger.info(f"Selected Voice: {voice_id}")

        # 英語など日本語以外の場合は AWS Translate で翻訳する
        translated_text = None
        if not is_japanese:
            try:
                translate_client = boto3.client('translate')
                translate_response = translate_client.translate_text(
                    Text=text,
                    SourceLanguageCode='auto',
                    TargetLanguageCode='ja'
                )
                translated_text = translate_response.get('TranslatedText')
                logger.info(f"Translated Text: {translated_text[:50]}...")
            except Exception as e:
                logger.error(f"Translate Error: {str(e)}")

        # Amazon Pollyで音声合成
        response = polly_client.synthesize_speech(
            Text=text,
            OutputFormat='mp3',
            VoiceId=voice_id
        )
        
        # 音声ストリームの取得とBase64エンコード
        if 'AudioStream' in response:
            audio_stream = response['AudioStream'].read()
            audio_base64 = base64.b64encode(audio_stream).decode('utf-8')
            res_body = {'audio': audio_base64}
            if translated_text:
                res_body['translated_text'] = translated_text
            return _build_response(200, res_body)
        else:
            return _build_response(500, {'error': 'Failed to generate audio stream'})
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return _build_response(500, {'error': 'Internal server error', 'details': str(e)})

def _build_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body)
    }